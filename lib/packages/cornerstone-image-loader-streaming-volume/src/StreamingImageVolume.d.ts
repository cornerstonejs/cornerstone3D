import { ImageVolume } from '@ohif/cornerstone-render';
import { Types } from '@ohif/cornerstone-render';
export default class StreamingImageVolume extends ImageVolume {
    private _cornerstoneImageMetaData;
    loadStatus: {
        loaded: boolean;
        loading: boolean;
        cachedFrames: Array<boolean>;
        callbacks: Array<(LoadStatusInterface: any) => void>;
    };
    constructor(imageVolumeProperties: Types.IVolume, streamingProperties: Types.IStreamingVolume);
    /**
     * Creates the metadata required for converting the volume to an cornerstoneImage
     *
     * @returns {void}
     */
    private _createCornerstoneImageMetaData;
    private _hasLoaded;
    cancelLoading(): void;
    clearLoadCallbacks(): void;
    load: (callback: (LoadStatusInterface: any) => void, priority?: number) => void;
    private _prefetchImageIds;
    private _addScalingToVolume;
    private _removeFromCache;
    /**
     * Converts the requested imageId inside the volume to a cornerstoneImage
     * object. It uses the typedArray set method to copy the pixelData from the
     * correct offset in the scalarData to a new array for the image
     *
     * @params{string} imageId
     * @params{number} imageIdIndex
     * @returns {ImageLoadObject} imageLoadObject containing the promise that resolves
     * to the cornerstone image
     */
    convertToCornerstoneImage(imageId: string, imageIdIndex: number): Types.ImageLoadObject;
    /**
     * Converts all the volume images (imageIds) to cornerstoneImages and caches them.
     * It iterates over all the imageIds and convert them until there is no
     * enough space left inside the imageCache. Finally it will decache the Volume.
     *
     * @returns {void}
     */
    private _convertToImages;
    decache(completelyRemove?: boolean): void;
}
