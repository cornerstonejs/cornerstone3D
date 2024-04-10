import { eventTarget, triggerEvent, type Types } from '@cornerstonejs/core';
import BaseStreamingImageVolume from './BaseStreamingImageVolume';
import { Events as StreamingEvents } from './enums';

type TimePoint = {
  /** imageIds of each timepoint  */
  imageIds: Array<string>;
  /** volume scalar data  */
  scalarData: Types.PixelDataTypedArray;
};

/**
 * Streaming Image Volume Class that extends StreamingImageVolume base class.
 * It implements load method to load the imageIds and insert them into the volume.
 */
export default class StreamingDynamicImageVolume
  extends BaseStreamingImageVolume
  implements Types.IDynamicImageVolume
{
  private _numTimePoints: number;
  private _timePoints: TimePoint[];
  private _timePointIndex = 0;
  private _splittingTag: string;

  constructor(
    imageVolumeProperties: Types.ImageVolumeProps & { splittingTag: string },
    streamingProperties: Types.IStreamingVolumeProperties
  ) {
    StreamingDynamicImageVolume._ensureValidData(
      imageVolumeProperties,
      streamingProperties
    );

    super(imageVolumeProperties, streamingProperties);
    this._numTimePoints = (<Types.PixelDataTypedArray[]>this.scalarData).length;
    this._timePoints = this._getTimePointsData();
    this._splittingTag = imageVolumeProperties.splittingTag;
  }

  private static _ensureValidData(
    imageVolumeProperties: Types.ImageVolumeProps,
    streamingProperties: Types.IStreamingVolumeProperties
  ): void {
    const imageIds = streamingProperties.imageIds;
    const scalarDataArrays = <Types.PixelDataTypedArray[]>(
      imageVolumeProperties.scalarData
    );

    if (imageIds.length % scalarDataArrays.length !== 0) {
      throw new Error(
        `Number of imageIds is not a multiple of ${scalarDataArrays.length}`
      );
    }
  }

  /**
   * Use the image ids and scalar data array to create TimePoint objects
   * and make it a bit easier to work with when loading requests
   */
  private _getTimePointsData(): TimePoint[] {
    const { imageIds } = this;
    const scalarData = <Types.PixelDataTypedArray[]>this.scalarData;

    const { numFrames } = this;
    const numTimePoints = scalarData.length;
    const timePoints: TimePoint[] = [];

    for (let i = 0; i < numTimePoints; i++) {
      const start = i * numFrames;
      const end = start + numFrames;

      timePoints.push({
        imageIds: imageIds.slice(start, end),
        scalarData: scalarData[i],
      });
    }

    return timePoints;
  }

  private _getTimePointsToLoad() {
    const timePoints = this._timePoints;
    const initialTimePointIndex = this._timePointIndex;
    const timePointsToLoad = [timePoints[initialTimePointIndex]];

    let leftIndex = initialTimePointIndex - 1;
    let rightIndex = initialTimePointIndex + 1;

    while (leftIndex >= 0 || rightIndex < timePoints.length) {
      if (leftIndex >= 0) {
        timePointsToLoad.push(timePoints[leftIndex--]);
      }

      if (rightIndex < timePoints.length) {
        timePointsToLoad.push(timePoints[rightIndex++]);
      }
    }

    return timePointsToLoad;
  }

  private _getTimePointRequests = (timePoint, priority: number) => {
    const { imageIds } = timePoint;

    return this.getImageIdsRequests(imageIds, priority);
  };

  private _getTimePointsRequests = (priority: number) => {
    const timePoints = this._getTimePointsToLoad();
    let timePointsRequests = [];

    timePoints.forEach((timePoint) => {
      const timePointRequests = this._getTimePointRequests(timePoint, priority);
      timePointsRequests = timePointsRequests.concat(timePointRequests);
    });

    return timePointsRequests;
  };

  public getImageIdsToLoad(): string[] {
    const timePoints = this._getTimePointsToLoad();
    let imageIds = [];

    timePoints.forEach((timePoint) => {
      const { imageIds: timePointIds } = timePoint;
      imageIds = imageIds.concat(timePointIds);
    });

    return imageIds;
  }

  /** return true if it is a 4D volume or false if it is 3D volume */
  public isDynamicVolume(): boolean {
    return true;
  }

  /**
   * Returns the active time point index
   * @returns active time point index
   */
  public get timePointIndex(): number {
    return this._timePointIndex;
  }

  /**
   * Set the active time point index which also updates the active scalar data
   * @returns current time point index
   */
  public set timePointIndex(newTimePointIndex: number) {
    if (newTimePointIndex < 0 || newTimePointIndex >= this.numTimePoints) {
      throw new Error(`Invalid timePointIndex (${newTimePointIndex})`);
    }

    // Nothing to do when time point index does not change
    if (this._timePointIndex === newTimePointIndex) {
      return;
    }

    const { imageData } = this;

    this._timePointIndex = newTimePointIndex;
    imageData.getPointData().setActiveScalars(`timePoint-${newTimePointIndex}`);
    this.invalidateVolume(true);

    triggerEvent(
      eventTarget,
      StreamingEvents.DYNAMIC_VOLUME_TIME_POINT_INDEX_CHANGED,
      {
        volumeId: this.volumeId,
        timePointIndex: newTimePointIndex,
        numTimePoints: this.numTimePoints,
        splittingTag: this.splittingTag,
      }
    );
  }

  /**
   * Returns the splitting tag used to split the imageIds in 4D volume
   */
  public get splittingTag(): string {
    return this._splittingTag;
  }

  /**
   * Returns the number of time points
   * @returns number of time points
   */
  public get numTimePoints(): number {
    return this._numTimePoints;
  }

  /**
   * Return the active scalar data (buffer)
   * @returns volume scalar data
   */
  public getScalarData(): Types.PixelDataTypedArray {
    return (<Types.PixelDataTypedArray[]>this.scalarData)[this._timePointIndex];
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
    return this._getTimePointsRequests(priority);
  };
}
