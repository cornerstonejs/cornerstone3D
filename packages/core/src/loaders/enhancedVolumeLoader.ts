import StreamingImageVolume from '../cache/classes/StreamingImageVolume';
import type { IRetrieveConfiguration } from '../types';
import { generateVolumePropsFromImageIds } from '../utilities/generateVolumePropsFromImageIds';
import decimate from '../utilities/decimate';
import VoxelManager from '../utilities/VoxelManager';
import {
  applyEnhancedVolumeModifiers,
  inPlaneDecimationModifier,
} from './enhancedVolumeModifiers';
import type {
  EnhancedVolumeLoaderOptions,
  EnhancedVolumeModifierContext,
  points,
} from './enhancedVolumeModifiers';
interface IVolumeLoader {
  promise: Promise<StreamingImageVolume>;
  cancel: () => void;
  decache: () => void;
}

/**
 * Enhanced volume loader that creates a StreamingImageVolume while delegating
 * volume mutations to a plugin-style modifier chain. The loader still handles the
 * responsibilities of preparing imageIds (including optional k-axis decimation),
 * instantiating the streaming volume, and updating VTK/voxel-manager state, but it
 * now relies on `enhancedVolumeModifiers` to encapsulate any transformations that
 * are specific to projection parameters such as decimation.
 *
 * The loader currently wires a dedicated modifier set for:
 * - **K-axis decimation handling**: Removes slices before metadata generation so
 *   that spacing reflects the decimated stack without manual scaling.
 * - **In-plane decimation**: Implemented by `InPlaneDecimationModifier`, which
 *   updates dimensions, spacing, and DICOM metadata in a self-contained class.
 *
 * Additional modifiers can be introduced by implementing the shared
 * `EnhancedVolumeModifier` interface. For example:
 * ```
 * const modifiers = [
 *   inPlaneDecimationModifier,
 *   orientationModifier,         // rotates the direction matrix or redefines axis order
 *   partialRangeModifier,        // limits the volume to a subset of frames / slices
 *   windowingModifier,           // applies window/level or LUT adjustments at load time
 * ];
 * ```
 * Modifiers are executed via `applyEnhancedVolumeModifiers`, so the loader still
 * just selects the set to run and trusts the chain to mutate props appropriately.
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
 * *
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
    ijkDecimation?: points.points3;
  }
): IVolumeLoader {
  if (!options || !options.imageIds || !options.imageIds.length) {
    throw new Error(
      'ImageIds must be provided to create a streaming image volume'
    );
  }

  // Use provided decimation or default to [1, 1, 1]
  // The hanging protocol service is responsible for providing decimation values
  const [iDecimation = 1, jDecimation = iDecimation, kDecimation = 1] =
    options.ijkDecimation ?? [];
  const columnDecimation = Math.max(1, Math.floor(iDecimation));
  const rowDecimation =
    jDecimation > 1 ? Math.max(1, Math.floor(jDecimation)) : columnDecimation;
  const kAxisDecimation = Math.max(1, Math.floor(kDecimation));
  const hasInPlaneDecimation = columnDecimation > 1 || rowDecimation > 1;

  const modifierOptions: EnhancedVolumeLoaderOptions = {
    ijkDecimation: [
      columnDecimation,
      rowDecimation,
      kAxisDecimation,
    ] as points.points3,
  };
  const modifiers = [inPlaneDecimationModifier];

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
  if (columnDecimation > 1) {
    options.imageIds = options.imageIds.map((imageId) =>
      addDecimationToImageId(imageId, columnDecimation)
    );
  }

  async function getStreamingImageVolume() {
    const baseVolumeProps = generateVolumePropsFromImageIds(
      options.imageIds,
      volumeId
    );

    const modifierContext: EnhancedVolumeModifierContext = {
      volumeId,
      imageIds: options.imageIds,
      options: modifierOptions,
    };

    const volumeProps = applyEnhancedVolumeModifiers(
      baseVolumeProps,
      modifiers,
      modifierContext
    );

    const {
      dimensions,
      spacing,
      origin,
      direction,
      metadata,
      imageIds,
      dataType,
      numberOfComponents,
    } = volumeProps;

    const streamingImageVolume = new StreamingImageVolume(
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

    if (hasInPlaneDecimation) {
      const vtkImageData = streamingImageVolume.imageData;
      if (vtkImageData) {
        vtkImageData.setDimensions(streamingImageVolume.dimensions);
        vtkImageData.setSpacing(streamingImageVolume.spacing);
        vtkImageData.modified();
      }

      const newVoxelManager = VoxelManager.createImageVolumeVoxelManager({
        dimensions: streamingImageVolume.dimensions,
        imageIds: streamingImageVolume.imageIds,
        numberOfComponents: numberOfComponents,
      });

      streamingImageVolume.voxelManager = newVoxelManager;

      if (vtkImageData) {
        vtkImageData.set({
          voxelManager: newVoxelManager,
        });
      }
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
