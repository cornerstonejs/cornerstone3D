import cache from '../cache/cache';
import StreamingImageVolume from '../cache/classes/StreamingImageVolume';
import { RequestType } from '../enums';
import imageLoadPoolManager from '../requestPool/imageLoadPoolManager';
import type { IRetrieveConfiguration } from '../types';
import { generateVolumePropsFromImageIds } from '../utilities/generateVolumePropsFromImageIds';
import { loadImage } from './imageLoader';
import decimate from '../utilities/decimate';
import decimateImagePixels from '../utilities/decimateImagePixels';
import { get as getMetaData, addProvider } from '../metaData';

interface IVolumeLoader {
  promise: Promise<StreamingImageVolume>;
  cancel: () => void;
  decache: () => void;
}

/**
 * It handles loading of a image by streaming in its imageIds. It will be the
 * volume loader if the schema for the volumeID is `decimateImageVolume`.
 * This function returns a promise that resolves to the StreamingImageVolume instance.
 *
 *
 * @param volumeId - The ID of the volume
 * @param options - options for loading, imageIds
 * @returns a promise that resolves to a StreamingImageVolume
 */
export function enhancedVolumeLoader(
  volumeId: string,
  options: {
    imageIds: string[];
    progressiveRendering?: boolean | IRetrieveConfiguration;
    ijkDecimation?: [number, number, number];
  }
): IVolumeLoader {
  console.log(`🚀 EnhancedVolumeLoader: Loading volume (${options?.imageIds?.length} images, decimation: ${options?.ijkDecimation?.join('x') || '1x1x1'})`);

  if (!options || !options.imageIds || !options.imageIds.length) {
    throw new Error(
      'ImageIds must be provided to create a streaming image volume'
    );
  }

  const [iDecimation, _jDecimation, kDecimation] = options.ijkDecimation || [
    1, 1, 1,
  ];
  const inPlaneDecimation = iDecimation > 1 ? iDecimation : 1;
  const kAxisDecimation = kDecimation > 1 ? kDecimation : 1;

  const originalImageIds = options.imageIds.slice();
  const decimatedResult = decimate(originalImageIds, kAxisDecimation);

  const decimatedImageIds =
    Array.isArray(decimatedResult) &&
    decimatedResult.length &&
    typeof decimatedResult[0] === 'number'
      ? decimatedResult.map((idx) => originalImageIds[idx])
      : decimatedResult;

  options.imageIds = decimatedImageIds as string[];

  async function getStreamingImageVolume() {
    /**
     * Check if we are using the `wadouri:` scheme, and if so, preload first,
     * middle, and last image metadata as these are the images the current
     * streaming image loader may explicitly request metadata from. The last image
     * metadata would only be specifically requested if the imageId array order is
     * reversed in the `sortImageIdsAndGetSpacing.ts` file.
     */
    if (options.imageIds[0].split(':')[0] === 'wadouri') {
      const [middleImageIndex, lastImageIndex] = [
        Math.floor(options.imageIds.length / 2),
        options.imageIds.length - 1,
      ];
      const indexesToPrefetch = [0, middleImageIndex, lastImageIndex];
      await Promise.all(
        indexesToPrefetch.map((index) => {
          // check if image is cached
          if (cache.isLoaded(options.imageIds[index])) {
            return Promise.resolve(true);
          }
          return new Promise((resolve, reject) => {
            const imageId = options.imageIds[index];
            imageLoadPoolManager.addRequest(
              async () => {
                loadImage(imageId)
                  .then(() => {
                    resolve(true);
                  })
                  .catch((err) => {
                    reject(err);
                  });
              },
              RequestType.Prefetch,
              { volumeId },
              1 // priority
            );
          });
        })
      ).catch(console.error);
    }

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
        progressiveRendering: false,
      }
    );

    console.log(`✅ Volume created: ${streamingImageVolume.dimensions.join('x')} (decimation: ${inPlaneDecimation}x${kAxisDecimation})`);
    console.log(`🔧 Volume bounds:`, {
      dimensions: streamingImageVolume.dimensions,
      spacing: streamingImageVolume.spacing,
      origin: streamingImageVolume.origin,
      direction: streamingImageVolume.direction
    });
    
    // Update VTK imageData bounds after decimation
    if (inPlaneDecimation > 1) {
      const vtkImageData = streamingImageVolume.imageData;
      if (vtkImageData) {
        console.log(`🔧 Updating VTK imageData bounds for decimation:`, {
          originalDimensions: dimensions,
          newDimensions: streamingImageVolume.dimensions,
          newSpacing: streamingImageVolume.spacing
        });
        
        // Update VTK imageData with new dimensions and spacing
        vtkImageData.setDimensions(streamingImageVolume.dimensions);
        vtkImageData.setSpacing(streamingImageVolume.spacing);
        
        // Force VTK to recalculate bounds
        vtkImageData.modified();
        
        console.log(`✅ VTK imageData bounds updated`);
      }
      
      // Create new voxel manager with correct dimensions
      console.log(`🔧 Creating new voxel manager for decimation:`, {
        originalDimensions: dimensions,
        newDimensions: streamingImageVolume.dimensions
      });
      
      // Import VoxelManager to create a new one
      const VoxelManager = require('../utilities/VoxelManager').default;
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
      
      console.log(`✅ New voxel manager created and set`);
    }
    
    // Track processed images to prevent double processing
    const processedImages = new Set<string>();
    
    streamingImageVolume.setImagePostProcess(
      (image) => {
        // Check if this image has already been processed
        if (processedImages.has(image.imageId)) {
          return image;
        }
        
        // Mark image as processed
        processedImages.add(image.imageId);
        
        // Check if image is already decimated to prevent double decimation
        const expectedDecimatedRows = Math.floor(streamingImageVolume.dimensions[1]);
        const expectedDecimatedCols = Math.floor(streamingImageVolume.dimensions[0]);
        
        if (image.rows === expectedDecimatedRows && image.columns === expectedDecimatedCols) {
          return image;
        }
        
        const decimatedImage = decimateImagePixels(image, inPlaneDecimation);
        
        // Update metadata for this specific image
        if (inPlaneDecimation > 1) {
          const originalGeneralImageModule = getMetaData('generalImageModule', image.imageId) || {};
          const originalImagePixelModule = getMetaData('imagePixelModule', image.imageId) || {};
          const originalImagePlaneModule = getMetaData('imagePlaneModule', image.imageId) || {};
          
          // Create updated metadata with decimated dimensions
          const updatedGeneralImageModule = {
            ...originalGeneralImageModule,
            Rows: decimatedImage.rows,
            Columns: decimatedImage.columns,
          };
          
          const updatedImagePixelModule = {
            ...originalImagePixelModule,
            Rows: decimatedImage.rows,
            Columns: decimatedImage.columns,
          };
          
          const updatedImagePlaneModule = {
            ...originalImagePlaneModule,
            Rows: decimatedImage.rows,
            Columns: decimatedImage.columns,
            PixelSpacing: [decimatedImage.rowPixelSpacing, decimatedImage.columnPixelSpacing],
          };
          
          // Add metadata providers for this specific image
          addProvider((type, imageId) => {
            if (imageId === image.imageId) {
              switch (type) {
                case 'generalImageModule':
                  return updatedGeneralImageModule;
                case 'imagePixelModule':
                  return updatedImagePixelModule;
                case 'imagePlaneModule':
                  return updatedImagePlaneModule;
                default:
                  return undefined;
              }
            }
            return undefined;
          });
        }
        
        return decimatedImage;
      }
    );
    console.debug(streamingImageVolume);
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