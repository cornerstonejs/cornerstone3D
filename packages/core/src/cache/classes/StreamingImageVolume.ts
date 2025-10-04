import type {
  ImageLoadRequests,
  ImageVolumeProps,
  IStreamingVolumeProperties,
  PixelDataTypedArray,
  IImage,
} from '../../types';
import BaseStreamingImageVolume from './BaseStreamingImageVolume';

/**
 * Streaming Image Volume Class that extends ImageVolume base class.
 * It implements load method to load the imageIds and insert them into the volume.
 */
export default class StreamingImageVolume extends BaseStreamingImageVolume {
  private imagePostProcess?: (image: IImage) => IImage;
  constructor(
    imageVolumeProperties: ImageVolumeProps,
    streamingProperties: IStreamingVolumeProperties
  ) {
    // Just for fallback to the old API
    if (!imageVolumeProperties.imageIds) {
      imageVolumeProperties.imageIds = streamingProperties.imageIds;
    }
    super(imageVolumeProperties, streamingProperties);
    
    // Track what's creating this StreamingImageVolume instance
    const stack = new Error().stack;
    const callerInfo = stack?.split('\n').slice(1, 8).join('\n') || 'Unknown caller';

    // Check if this volume is using enhanced volume loader
    const isEnhancedVolume = imageVolumeProperties.volumeId?.startsWith('enhancedVolumeLoader:');
    if (!isEnhancedVolume) {
      console.warn('⚠️ StreamingImageVolume: Volume is NOT using enhancedVolumeLoader - CREATED BY:', {
        volumeId: imageVolumeProperties.volumeId,
        imageIdsCount: imageVolumeProperties.imageIds?.length,
        firstImageId: imageVolumeProperties.imageIds?.[0]?.substring(0, 50) + '...',
        volumeSchema: imageVolumeProperties.volumeId?.split(':')[0],
        fullCallStack: callerInfo
      });
    } else {
      console.log('✅ StreamingImageVolume: Enhanced volume created with', imageVolumeProperties.imageIds?.length, 'images - FULL CALL STACK:', {
        volumeId: imageVolumeProperties.volumeId,
        imageIdsCount: imageVolumeProperties.imageIds?.length,
        firstImageId: imageVolumeProperties.imageIds?.[0]?.substring(0, 50) + '...',
        lastImageId: imageVolumeProperties.imageIds?.[imageVolumeProperties.imageIds?.length - 1]?.substring(0, 50) + '...',
        fullCallStack: callerInfo
      });
    }
  }
  public setImagePostProcess(fn: (image: IImage) => IImage) {
    this.imagePostProcess = fn;
  }

  // Override successCallback to apply post-process if set
  public override successCallback(imageId: string, image: IImage) {
    const isEnhancedVolume = this.volumeId?.startsWith('enhancedVolumeLoader:');
    const hasPostProcess = !!this.imagePostProcess;

    // Count total images processed across all volumes
    if (!(window as any).totalImagesProcessed) (window as any).totalImagesProcessed = 0;
    if (!(window as any).enhancedImagesProcessed) (window as any).enhancedImagesProcessed = 0;
    if (!(window as any).nonEnhancedImagesProcessed) (window as any).nonEnhancedImagesProcessed = 0;
    
    (window as any).totalImagesProcessed++;
    if (isEnhancedVolume) {
      (window as any).enhancedImagesProcessed++;
    } else {
      (window as any).nonEnhancedImagesProcessed++;
    }

    // Log every 10 images to track progress more closely
    if ((window as any).totalImagesProcessed % 10 === 0) {
      console.warn('🔢 StreamingImageVolume: IMAGE PROCESSING STATS:', {
        totalImagesProcessed: (window as any).totalImagesProcessed,
        enhancedImagesProcessed: (window as any).enhancedImagesProcessed,
        nonEnhancedImagesProcessed: (window as any).nonEnhancedImagesProcessed,
        currentImageVolumeId: this.volumeId,
        currentImageDimensions: `${image.columns}x${image.rows}`,
        isCurrentEnhanced: isEnhancedVolume
      });
    }

    // Warning for non-enhanced volumes (these shouldn't exist if decimation is working properly)
    if (!isEnhancedVolume) {
      console.warn('🚨 StreamingImageVolume: NON-ENHANCED VOLUME PROCESSING IMAGE!', {
        volumeId: this.volumeId,
        imageId: imageId.substring(0, 50) + '...',
        imageDimensions: `${image.columns}x${image.rows}`,
        volumeSchema: this.volumeId?.split(':')[0],
        pixelDataLength: image.getPixelData().length,
        totalNonEnhancedSoFar: (window as any).nonEnhancedImagesProcessed,
        suggestion: 'This volume should be using enhancedVolumeLoader for decimation'
      });
    }

    // Warning for enhanced volumes without post-processing
    if (isEnhancedVolume && !hasPostProcess) {
      console.warn('⚠️ StreamingImageVolume: Enhanced volume has NO post-processing function!', {
        volumeId: this.volumeId,
        imageId: imageId.substring(0, 50) + '...',
        imageDimensions: `${image.columns}x${image.rows}`,
        expectedDecimation: 'Should be decimated but no post-process function'
      });
    }

    // Log large images (potential missed decimation)
    if (image.columns > 400 || image.rows > 400) {
      console.warn('🔍 StreamingImageVolume: LARGE IMAGE DETECTED!', {
        volumeId: this.volumeId,
        imageId: imageId.substring(0, 50) + '...',
        imageDimensions: `${image.columns}x${image.rows}`,
        isEnhancedVolume,
        hasPostProcess,
        warning: 'Image dimensions are larger than expected for decimated volume'
      });
    }

    if (this.imagePostProcess) {
      try {
        const originalImage = image;
        image = this.imagePostProcess(image) || image;
        
        // Log if post-processing changed dimensions
        if (originalImage.columns !== image.columns || originalImage.rows !== image.rows) {
          console.log('✅ StreamingImageVolume: Post-processing changed dimensions:', {
            before: `${originalImage.columns}x${originalImage.rows}`,
            after: `${image.columns}x${image.rows}`,
            volumeId: this.volumeId
          });
        }
      } catch (e) {
        console.warn('imagePostProcess failed, using original image', e);
      }
    }
    super.successCallback(imageId, image);
  }

  /**
   * Return the scalar data (buffer)
   * @returns volume scalar data
   */
  public getScalarData(): PixelDataTypedArray {
    return <PixelDataTypedArray>this.voxelManager.getScalarData();
  }

  /**
   * It returns the imageLoad requests for the streaming image volume instance.
   * It involves getting all the imageIds of the volume and creating a success callback
   * which would update the texture (when the image has loaded) and the failure callback.
   * Note that this method does not executes the requests but only returns the requests.
   * It can be used for sorting requests outside of the volume loader itself
   * e.g. loading a single slice of CT, followed by a single slice of PET (interleaved), before
   * moving to the next slice.
   *
   * @returns Array of requests including imageId of the request, its imageIdIndex,
   * options (targetBuffer and scaling parameters), and additionalDetails (volumeId)
   */
  public getImageLoadRequests(priority: number): ImageLoadRequests[] {
    const { imageIds } = this;

    return this.getImageIdsRequests(imageIds, priority);
  }

  public getImageIdsToLoad = () => {
    const { imageIds } = this;
    this.numFrames = imageIds.length;
    return imageIds;
  };
}
