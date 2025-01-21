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
  private _dimensionGroupNumber = 1;
  private _splittingTag: string;
  private _imageIdGroups: string[][];
  private _loadedDimensionGroups: Set<number> = new Set();

  public numDimensionGroups: number;
  /** @deprecated Use numDimensionGroups instead */
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
    this.numDimensionGroups = this._imageIdGroups.length;
    this.numTimePoints = this.numDimensionGroups; // Keep in sync for backward compatibility
  }

  private _getImageIdsToLoad(): string[] {
    const imageIdGroups = this._imageIdGroups;
    const initialImageIdGroupIndex = this._dimensionGroupNumber - 1;
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
   * Returns the active dimension group number (1-based)
   * @returns active dimension group number
   */
  public get dimensionGroupNumber(): number {
    return this._dimensionGroupNumber;
  }

  /**
   * @deprecated Use dimensionGroupNumber instead. timePointIndex is zero-based while dimensionGroupNumber starts at 1.
   */
  public set timePointIndex(index: number) {
    console.warn(
      'Warning: timePointIndex is deprecated. Please use dimensionGroupNumber instead. Note that timePointIndex is zero-based while dimensionGroupNumber starts at 1.'
    );

    // Convert zero-based timePointIndex to one-based dimensionGroupNumber
    this.dimensionGroupNumber = index + 1;
  }

  /**
   * Set the active dimension group number which also updates the active scalar data
   * Dimension group numbers are 1-based.
   *
   * @param dimensionGroupNumber - The dimension group number to set as active (1-based)
   */
  public set dimensionGroupNumber(dimensionGroupNumber: number) {
    if (this._dimensionGroupNumber === dimensionGroupNumber) {
      return;
    }

    this._dimensionGroupNumber = dimensionGroupNumber;
    // @ts-expect-error
    this.voxelManager.setDimensionGroupNumber(dimensionGroupNumber);

    this.invalidateVolume(true);

    triggerEvent(eventTarget, Events.DYNAMIC_VOLUME_DIMENSION_GROUP_CHANGED, {
      volumeId: this.volumeId,
      dimensionGroupNumber: dimensionGroupNumber,
      numDimensionGroups: this.numDimensionGroups,
      splittingTag: this.splittingTag,
    });

    triggerEvent(eventTarget, Events.DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED, {
      volumeId: this.volumeId,
      timePointIndex: dimensionGroupNumber - 1,
      numTimePoints: this.numDimensionGroups,
      splittingTag: this.splittingTag,
    });
  }

  /**
   * @deprecated Use dimensionGroupNumber instead. timePointIndex is zero-based while dimensionGroupNumber starts at 1.
   */
  public get timePointIndex(): number {
    console.warn(
      'Warning: timePointIndex is deprecated. Please use dimensionGroupNumber instead. Note that timePointIndex is zero-based while dimensionGroupNumber starts at 1.'
    );
    return this._dimensionGroupNumber - 1;
  }

  /**
   * Scroll properly to enable looping
   * @param delta - The amount to scroll
   */
  public scroll(delta: number): void {
    const newDimensionGroupNumber = this._dimensionGroupNumber + delta;

    if (newDimensionGroupNumber < 1) {
      this.dimensionGroupNumber = this.numDimensionGroups;
    } else if (newDimensionGroupNumber > this.numDimensionGroups) {
      this.dimensionGroupNumber = 1;
    } else {
      this.dimensionGroupNumber = newDimensionGroupNumber;
    }
  }

  public getCurrentDimensionGroupImageIds(): string[] {
    return this._imageIdGroups[this._dimensionGroupNumber - 1];
  }

  /**
   * @deprecated Use getCurrentDimensionGroupImageIds instead
   */
  public getCurrentTimePointImageIds(): string[] {
    console.warn(
      'Warning: getCurrentTimePointImageIds is deprecated. Please use getCurrentDimensionGroupImageIds instead.'
    );
    return this.getCurrentDimensionGroupImageIds();
  }

  public flatImageIdIndexToDimensionGroupNumber(
    flatImageIdIndex: number
  ): number {
    return Math.floor(flatImageIdIndex / this._imageIdGroups[0].length) + 1;
  }

  /** @deprecated Use flatImageIdIndexToDimensionGroupNumber instead */
  public flatImageIdIndexToFrameNumber(flatImageIdIndex: number): number {
    console.warn(
      'Warning: flatImageIdIndexToFrameNumber is deprecated. Please use flatImageIdIndexToDimensionGroupNumber instead.'
    );
    return this.flatImageIdIndexToDimensionGroupNumber(flatImageIdIndex);
  }

  /**
   * @deprecated Use flatImageIdIndexToDimensionGroupNumber instead
   */
  public flatImageIdIndexToTimePointIndex(flatImageIdIndex: number): number {
    console.warn(
      'Warning: flatImageIdIndexToTimePointIndex is deprecated. Please use flatImageIdIndexToDimensionGroupNumber instead.'
    );
    return this.flatImageIdIndexToDimensionGroupNumber(flatImageIdIndex) - 1;
  }

  public flatImageIdIndexToImageIdIndex(flatImageIdIndex: number): number {
    return flatImageIdIndex % this._imageIdGroups[0].length;
  }

  /**
   * Returns the splitting tag used to split the imageIds in the volume
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
   * Checks if a specific dimension group is fully loaded
   * @param dimensionGroupNumber - The dimension group number to check (1-based)
   * @returns boolean indicating if the dimension group is fully loaded
   */
  public isDimensionGroupLoaded(dimensionGroupNumber: number): boolean {
    return this._loadedDimensionGroups.has(dimensionGroupNumber);
  }

  /**
   * @deprecated Use isDimensionGroupLoaded instead
   */
  public isTimePointLoaded(timePointIndex: number): boolean {
    console.warn(
      'Warning: isTimePointLoaded is deprecated. Please use isDimensionGroupLoaded instead. Note that timePointIndex is zero-based while dimensionGroupNumber starts at 1.'
    );
    return this.isDimensionGroupLoaded(timePointIndex + 1);
  }

  /**
   * Marks a dimension group as fully loaded
   * @param dimensionGroupNumber - The dimension group number to mark as loaded (1-based)
   */
  private markDimensionGroupAsLoaded(dimensionGroupNumber: number): void {
    this._loadedDimensionGroups.add(dimensionGroupNumber);

    // Trigger new dimension group-based event
    triggerEvent(eventTarget, Events.DYNAMIC_VOLUME_DIMENSION_GROUP_LOADED, {
      volumeId: this.volumeId,
      frameNumber: dimensionGroupNumber,
    });

    // Trigger deprecated time point event for backward compatibility
    triggerEvent(eventTarget, Events.DYNAMIC_VOLUME_TIME_POINT_LOADED, {
      volumeId: this.volumeId,
      timePointIndex: dimensionGroupNumber - 1,
    });
  }

  /**
   * @deprecated Use checkDimensionGroupCompletion instead
   */
  protected checkTimePointCompletion(imageIdIndex: number): void {
    console.warn(
      'Warning: checkTimePointCompletion is deprecated. Please use checkDimensionGroupCompletion instead.'
    );
    this.checkDimensionGroupCompletion(imageIdIndex);
  }

  protected checkDimensionGroupCompletion(imageIdIndex: number): void {
    const dimensionGroupNumber =
      this.flatImageIdIndexToDimensionGroupNumber(imageIdIndex);
    const imageIdsInDimensionGroup =
      this._imageIdGroups[dimensionGroupNumber - 1];

    const allLoaded = imageIdsInDimensionGroup.every((imageId) => {
      const index = this.getImageIdIndex(imageId);
      return this.cachedFrames[index] === ImageQualityStatus.FULL_RESOLUTION;
    });

    if (allLoaded && !this.isDimensionGroupLoaded(dimensionGroupNumber)) {
      this.markDimensionGroupAsLoaded(dimensionGroupNumber);
    }
  }
}
