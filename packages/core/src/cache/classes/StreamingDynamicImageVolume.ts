import { Events, ImageQualityStatus } from '../../enums';
import eventTarget from '../../eventTarget';
import type {
  IDynamicImageVolume,
  ImageVolumeProps,
  IStreamingVolumeProperties,
} from '../../types';
import { triggerEvent } from '../../utilities';
import BaseStreamingImageVolume from './BaseStreamingImageVolume';

/**
 * Streaming Image Volume Class that extends StreamingImageVolume base class.
 * It implements load method to load the imageIds and insert them into the volume.
 */
export default class StreamingDynamicImageVolume
  extends BaseStreamingImageVolume
  implements IDynamicImageVolume
{
  private _frameNumber = 1;
  private _splittingTag: string;
  private _imageIdGroups: string[][];
  private _loadedFrames: Set<number> = new Set();

  public numFrames: number;
  /** @deprecated Use numFrames instead */
  public override numTimePoints: number;

  constructor(
    imageVolumeProperties: ImageVolumeProps & {
      splittingTag: string;
      imageIdGroups: string[][];
    },
    streamingProperties: IStreamingVolumeProperties
  ) {
    super(imageVolumeProperties, streamingProperties);
    const { imageIdGroups, splittingTag } = imageVolumeProperties;
    this._splittingTag = splittingTag;
    this._imageIdGroups = imageIdGroups;
    this.numFrames = this._imageIdGroups.length;
    this.numTimePoints = this.numFrames; // Keep in sync for backward compatibility
  }

  private _getImageIdsToLoad(): string[] {
    const imageIdGroups = this._imageIdGroups;
    const initialImageIdGroupIndex = this._frameNumber - 1;
    const imageIds = [...imageIdGroups[initialImageIdGroupIndex]];

    let leftIndex = initialImageIdGroupIndex - 1;
    let rightIndex = initialImageIdGroupIndex + 1;

    while (leftIndex >= 0 || rightIndex < imageIdGroups.length) {
      if (leftIndex >= 0) {
        imageIds.push(...imageIdGroups[leftIndex--]);
      }

      if (rightIndex < imageIdGroups.length) {
        imageIds.push(...imageIdGroups[rightIndex++]);
      }
    }

    return imageIds;
  }

  private _getImageIdRequests = (imageIds, priority: number) => {
    return this.getImageIdsRequests(imageIds, priority);
  };

  public getImageIdsToLoad(): string[] {
    return this._getImageIdsToLoad();
  }

  /**
   * Returns the active frame number (1-based)
   * @returns active frame number
   */
  public get frameNumber(): number {
    return this._frameNumber;
  }

  /**
   * Set the active frame number which also updates the active scalar data
   * Frame numbers are 1-based.
   *
   * @param frameNumber - The frame number to set as active (1-based)
   */
  public set frameNumber(frameNumber: number) {
    if (this._frameNumber === frameNumber) {
      return;
    }

    this._frameNumber = frameNumber;
    // @ts-expect-error since we need to override the type for now
    this.voxelManager.setFrameNumber(frameNumber);

    this.invalidateVolume(true);

    triggerEvent(eventTarget, Events.DYNAMIC_VOLUME_FRAME_NUMBER_CHANGED, {
      volumeId: this.volumeId,
      frameNumber: frameNumber,
      numFrames: this.numFrames,
      splittingTag: this.splittingTag,
    });
  }

  /**
   * @deprecated Use frameNumber instead. timePointIndex is zero-based while frameNumber starts at 1.
   */
  public get timePointIndex(): number {
    console.warn(
      'Warning: timePointIndex is deprecated. Please use frameNumber instead. Note that timePointIndex is zero-based while frameNumber starts at 1.'
    );
    return this._frameNumber - 1;
  }

  /**
   * @deprecated Use frameNumber instead. timePointIndex is zero-based while frameNumber starts at 1.
   */
  public set timePointIndex(index: number) {
    console.warn(
      'Warning: timePointIndex is deprecated. Please use frameNumber instead. Note that timePointIndex is zero-based while frameNumber starts at 1.'
    );
    this.frameNumber = index + 1;
  }

  /**
   * Scroll properly to enable looping
   * @param delta - The amount to scroll
   */
  public scroll(delta: number): void {
    const newFrameNumber = this._frameNumber + delta;

    if (newFrameNumber < 1) {
      this.frameNumber = this.numFrames;
    } else if (newFrameNumber > this.numFrames) {
      this.frameNumber = 1;
    } else {
      this.frameNumber = newFrameNumber;
    }
  }

  public getCurrentFrameImageIds(): string[] {
    return this._imageIdGroups[this._frameNumber - 1];
  }

  /**
   * @deprecated Use getCurrentFrameImageIds instead
   */
  public getCurrentTimePointImageIds(): string[] {
    console.warn(
      'Warning: getCurrentTimePointImageIds is deprecated. Please use getCurrentFrameImageIds instead.'
    );
    return this.getCurrentFrameImageIds();
  }

  public flatImageIdIndexToFrameNumber(flatImageIdIndex: number): number {
    return Math.floor(flatImageIdIndex / this._imageIdGroups[0].length) + 1;
  }

  /**
   * @deprecated Use flatImageIdIndexToFrameNumber instead
   */
  public flatImageIdIndexToTimePointIndex(flatImageIdIndex: number): number {
    console.warn(
      'Warning: flatImageIdIndexToTimePointIndex is deprecated. Please use flatImageIdIndexToFrameNumber instead.'
    );
    return this.flatImageIdIndexToFrameNumber(flatImageIdIndex) - 1;
  }

  public flatImageIdIndexToImageIdIndex(flatImageIdIndex: number): number {
    return flatImageIdIndex % this._imageIdGroups[0].length;
  }

  /**
   * Returns the splitting tag used to split the imageIds in 4D volume
   */
  public get splittingTag(): string {
    return this._splittingTag;
  }

  /**
   * It returns the imageLoad requests for the streaming image volume instance.
   * It involves getting all the imageIds of the volume and creating a success callback
   * which would update the texture (when the image has loaded) and the failure callback.
   * Note that this method does not execute the requests but only returns the requests.
   * It can be used for sorting requests outside of the volume loader itself
   * e.g. loading a single slice of CT, followed by a single slice of PET (interleaved), before
   * moving to the next slice.
   *
   * @returns Array of requests including imageId of the request, its imageIdIndex,
   * options (targetBuffer and scaling parameters), and additionalDetails (volumeId)
   */
  public getImageLoadRequests = (priority: number) => {
    const imageIds = this.getImageIdsToLoad();
    return this._getImageIdRequests(imageIds, priority);
  };

  /**
   * Checks if a specific frame is fully loaded
   * @param frameNumber - The frame number to check (1-based)
   * @returns boolean indicating if the frame is fully loaded
   */
  public isFrameLoaded(frameNumber: number): boolean {
    return this._loadedFrames.has(frameNumber);
  }

  /**
   * @deprecated Use isFrameLoaded instead
   */
  public isTimePointLoaded(timePointIndex: number): boolean {
    console.warn(
      'Warning: isTimePointLoaded is deprecated. Please use isFrameLoaded instead. Note that timePointIndex is zero-based while frameNumber starts at 1.'
    );
    return this.isFrameLoaded(timePointIndex + 1);
  }

  /**
   * Marks a frame as fully loaded
   * @param frameNumber - The frame number to mark as loaded (1-based)
   */
  private markFrameAsLoaded(frameNumber: number): void {
    this._loadedFrames.add(frameNumber);

    // Trigger new frame-based event
    triggerEvent(eventTarget, Events.DYNAMIC_VOLUME_FRAME_NUMBER_LOADED, {
      volumeId: this.volumeId,
      frameNumber,
    });

    // Trigger deprecated time point event for backward compatibility
    triggerEvent(eventTarget, Events.DYNAMIC_VOLUME_TIME_POINT_LOADED, {
      volumeId: this.volumeId,
      timePointIndex: frameNumber - 1,
    });
  }

  protected checkFrameCompletion(imageIdIndex: number): void {
    const frameNumber = this.flatImageIdIndexToFrameNumber(imageIdIndex);
    const imageIdsInFrame = this._imageIdGroups[frameNumber - 1];

    const allLoaded = imageIdsInFrame.every((imageId) => {
      const index = this.getImageIdIndex(imageId);
      return this.cachedFrames[index] === ImageQualityStatus.FULL_RESOLUTION;
    });

    if (allLoaded && !this.isFrameLoaded(frameNumber)) {
      this.markFrameAsLoaded(frameNumber);
    }
  }

  /**
   * @deprecated Use checkFrameCompletion instead
   */
  protected checkTimePointCompletion(imageIdIndex: number): void {
    console.warn(
      'Warning: checkTimePointCompletion is deprecated. Please use checkFrameCompletion instead.'
    );
    this.checkFrameCompletion(imageIdIndex);
  }
}
