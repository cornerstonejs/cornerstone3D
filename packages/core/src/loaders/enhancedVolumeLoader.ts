import StreamingImageVolume from '../cache/classes/StreamingImageVolume';
import type { IRetrieveConfiguration } from '../types';
import { generateVolumePropsFromImageIds } from '../utilities/generateVolumePropsFromImageIds';
import decimate from '../utilities/decimate';
import VoxelManager from '../utilities/VoxelManager';
interface IVolumeLoader {
  promise: Promise<StreamingImageVolume>;
  cancel: () => void;
  decache: () => void;
}

/**
 * Enhanced volume loader that creates a StreamingImageVolume with optional decimation
 * capabilities for optimized rendering and memory usage. This loader supports both
 * k-axis (slice) decimation and in-plane (pixel) decimation to reduce volume resolution.
 *
 * The loader performs the following operations:
 * - **K-axis decimation**: Reduces the number of slices by keeping every Nth slice
 *   (e.g., decimation=2 keeps every other slice). This is applied before volume creation
 *   unless already decimated at the displaySet level.
 * - **In-plane decimation**: Downsamples the resolution of each slice by reducing pixel
 *   dimensions. This is achieved by appending a decimation parameter to imageIds, which
 *   is processed during image loading.
 *   The BaseStreamingVolume has been adjusted to handle the desired dimensions (targetRows and targetColumns)
 *    DecodeImageFrame is used to decode produce the PixelData.
 * - Automatically adjusts volume spacing, dimensions, and DICOM metadata to reflect
 *   the decimated resolution.
 *
 * @param volumeId - The unique identifier for the volume
 * @param options - Configuration options for volume loading
 * @param options.imageIds - Array of DICOM imageIds to construct the volume from (required)
 * @param options.progressiveRendering - Enable progressive rendering or provide custom
 *   retrieve configuration for streaming behavior
 * @param options.ijkDecimation - Decimation factors for [I, J, K] axes where I/J affect
 *   in-plane resolution and K affects slice count. Defaults to [1, 1, 1] (no decimation).
 *   Example: [2, 2, 2] reduces dimensions by half in all axes.
 *
 * @returns An object containing:
 *   - `promise`: Resolves to the created StreamingImageVolume instance
 *   - `cancel`: Function to cancel ongoing volume loading
 *   - `decache`: Function to destroy and remove the volume from cache
 *
 * @throws Error if imageIds are not provided or empty
 *
 * @example
 * ```typescript
 * const volumeLoader = enhancedVolumeLoader('volumeId', {
 *   imageIds: ['dicomweb:...', 'dicomweb:...'],
 *   ijkDecimation: [2, 2, 2], // Half resolution in all dimensions
 *   progressiveRendering: true
 * });
 *
 * const volume = await volumeLoader.promise;
 * // Later: volumeLoader.cancel() or volumeLoader.decache()
 * ```
 */
export function enhancedVolumeLoader(
  volumeId: string,
  options: {
    imageIds: string[];
    progressiveRendering?: boolean | IRetrieveConfiguration;
    ijkDecimation?: [number, number, number];
  }
): IVolumeLoader {
  // Use provided decimation or default to [1, 1, 1]
  // The hanging protocol service is responsible for providing decimation values
  const decimationValues = options.ijkDecimation || [1, 1, 1];

  if (!options || !options.imageIds || !options.imageIds.length) {
    throw new Error(
      'ImageIds must be provided to create a streaming image volume'
    );
  }

  const [iDecimation, _jDecimation, kDecimation] = decimationValues;
  const inPlaneDecimation = iDecimation > 1 ? iDecimation : 1;
  const kAxisDecimation = kDecimation > 1 ? kDecimation : 1;

  // Function to add decimation parameter to imageId
  function addDecimationToImageId(imageId: string, factor: number): string {
    // Only add param if decimation is applied
    if (factor === 1) {
      return imageId;
    }

    // Check if imageId already has query params
    const separator = imageId.includes('?') ? '&' : '?';
    return `${imageId}${separator}decimation=${factor}`;
  }

  // Check if k-decimation has already been applied at the displaySet level
  const expectedDecimatedCount = Math.floor(
    options.imageIds.length / kAxisDecimation
  );
  const isAlreadyDecimated =
    kAxisDecimation > 1 &&
    options.imageIds.length <= expectedDecimatedCount + 1;

  if (kAxisDecimation > 1 && !isAlreadyDecimated) {
    // Apply k-decimation to reduce the number of slices

    const decimatedResult = decimate(options.imageIds, kAxisDecimation);

    const decimatedImageIds =
      Array.isArray(decimatedResult) &&
      decimatedResult.length &&
      typeof decimatedResult[0] === 'number'
        ? decimatedResult.map((idx) => options.imageIds[idx])
        : decimatedResult;

    options.imageIds = decimatedImageIds as string[];
  }

  // Apply in-plane decimation parameter to imageIds
  if (inPlaneDecimation > 1) {
    options.imageIds = options.imageIds.map((imageId) =>
      addDecimationToImageId(imageId, inPlaneDecimation)
    );
  }

  async function getStreamingImageVolume() {
    const volumeProps = generateVolumePropsFromImageIds(
      options.imageIds,
      volumeId
    );

    let {
      dimensions,
      spacing,
      origin,
      direction,
      metadata,
      imageIds,
      dataType,
      numberOfComponents,
    } = volumeProps;

    // Start from current props and apply decimations independently
    let newDimensions = [...dimensions] as typeof dimensions;
    let newSpacing = [...spacing] as typeof spacing;

    // Apply in‑plane decimation (columns = x = index 0, rows = y = index 1)
    if (inPlaneDecimation > 1) {
      newDimensions[0] = Math.floor(newDimensions[0] / inPlaneDecimation);
      newDimensions[1] = Math.floor(newDimensions[1] / inPlaneDecimation);
      newSpacing[0] = newSpacing[0] * inPlaneDecimation; // column spacing (x)
      newSpacing[1] = newSpacing[1] * inPlaneDecimation; // row spacing (y)

      // DICOM: Rows = Y, Columns = X
      metadata.Rows = newDimensions[1];
      metadata.Columns = newDimensions[0];
      // DICOM PixelSpacing = [row, column] = [y, x]
      metadata.PixelSpacing = [newSpacing[1], newSpacing[0]];
    }

    // Do NOT scale Z spacing here. We decimated imageIds before
    // generating volume props, so sortImageIdsAndGetSpacing already
    // computed the effective z-spacing between the kept frames.

    // Commit any updates
    dimensions = newDimensions;
    spacing = newSpacing;
    const streamingImageVolume = new StreamingImageVolume(
      // ImageVolume properties
      {
        volumeId,
        metadata,
        dimensions,
        spacing,
        origin,
        direction,
        imageIds,
        dataType,
        numberOfComponents,
      },
      // Streaming properties
      {
        imageIds,
        loadStatus: {
          loaded: false,
          loading: false,
          cancelled: false,
          cachedFrames: [],
          callbacks: [],
        },
      }
    );

    // Update VTK imageData bounds after decimation
    if (inPlaneDecimation > 1) {
      const vtkImageData = streamingImageVolume.imageData;
      if (vtkImageData) {
        // Update VTK imageData with new dimensions and spacing
        vtkImageData.setDimensions(streamingImageVolume.dimensions);
        vtkImageData.setSpacing(streamingImageVolume.spacing);

        // Force VTK to recalculate bounds
        vtkImageData.modified();
      }
      const newVoxelManager = VoxelManager.createImageVolumeVoxelManager({
        dimensions: streamingImageVolume.dimensions,
        imageIds: streamingImageVolume.imageIds,
        numberOfComponents: numberOfComponents,
      });

      // Update the volume's voxel manager
      streamingImageVolume.voxelManager = newVoxelManager;

      // Update VTK imageData to use new voxel manager
      vtkImageData.set({
        voxelManager: newVoxelManager,
      });
    }

    return streamingImageVolume;
  }

  const streamingImageVolumePromise = getStreamingImageVolume();

  return {
    promise: streamingImageVolumePromise,
    decache: () => {
      streamingImageVolumePromise.then((streamingImageVolume) => {
        streamingImageVolume.destroy();
        streamingImageVolume = null;
      });
    },
    cancel: () => {
      streamingImageVolumePromise.then((streamingImageVolume) => {
        streamingImageVolume.cancelLoading();
      });
    },
  };
}

export default enhancedVolumeLoader;
