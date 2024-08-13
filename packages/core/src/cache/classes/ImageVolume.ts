import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import { imageIdToURI, VoxelManager } from '../../utilities';
import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses';
import {
  Metadata,
  Point3,
  IImageVolume,
  Mat3,
  PixelDataTypedArray,
  ImageVolumeProps,
  IImage,
  PixelDataTypedArrayString,
  RGB,
} from '../../types';
import cache from '../cache';

/** The base class for volume data. It includes the volume metadata
 * and the volume data along with the loading status.
 */
export class ImageVolume implements IImageVolume {
  private _imageIds: Array<string>;
  private _imageIdsIndexMap = new Map();
  private _imageURIsIndexMap = new Map();
  /** volume scalar data 3D or 4D */
  protected numFrames: number;
  protected totalNumFrames: number;
  protected cornerstoneImageMetaData = null;

  /** Read-only unique identifier for the volume */
  readonly volumeId: string;

  imageCacheOffsetMap = new Map();

  isPreScaled = false;

  /** Dimensions of the volume */
  dimensions: Point3;
  /** volume direction in world space */
  direction: Mat3;
  /** volume metadata */
  metadata: Metadata;
  /** volume origin, Note this is an opinionated origin for the volume */
  origin: Point3;
  /** Whether preScaling has been performed on the volume */
  /** volume scaling parameters if it contains scaled data */
  scaling?: {
    PT?: {
      // @TODO: Do these values exist?
      SUVlbmFactor?: number;
      SUVbsaFactor?: number;
      // accessed in ProbeTool
      suvbwToSuvlbm?: number;
      suvbwToSuvbsa?: number;
    };
  };
  /** volume spacing in 3d world space */
  spacing: Point3;
  /** volume number of voxels */
  numVoxels: number;
  /** volume image data */
  imageData?: vtkImageData;
  /** open gl texture for the volume */
  vtkOpenGLTexture: any; // No good way of referencing vtk classes as they aren't classes.
  /** load status object for the volume */
  loadStatus?: Record<string, any>;
  /** optional reference volume id if the volume is derived from another volume */
  referencedVolumeId?: string;
  /** optional reference image ids if the volume is derived from a set of images in the image cache */
  referencedImageIds?: Array<string>;
  /** whether the metadata for the pixel spacing is not undefined  */
  hasPixelSpacing: boolean;
  /** Property to store additional information */
  additionalDetails?: Record<string, any>;

  /**
   * The new volume model which solely relies on the separate image data
   * and do not cache the volume data at all
   */
  voxelManager?: VoxelManager<number | RGB>;
  dataType?: PixelDataTypedArrayString;

  numTimePoints? = null as number;

  constructor(props: ImageVolumeProps) {
    const {
      imageIds,
      scaling,
      dimensions,
      spacing,
      origin,
      direction,
      dataType,
      volumeId,
      referencedVolumeId,
      metadata,
      referencedImageIds,
      additionalDetails,
      voxelManager,
      numberOfComponents,
    } = props;

    if (!dataType) {
      throw new Error(
        'Data type is required, please provide a data type as string such as "Uint8Array", "Float32Array", etc.'
      );
    }

    let { imageData } = props;

    this.imageIds = imageIds;
    this.volumeId = volumeId;
    this.metadata = metadata;
    this.dimensions = dimensions;
    this.spacing = spacing;
    this.origin = origin;
    this.direction = direction;
    this.dataType = dataType;

    this.vtkOpenGLTexture = vtkStreamingOpenGLTexture.newInstance();
    this.vtkOpenGLTexture.setVolumeId(volumeId);

    this.voxelManager =
      voxelManager ??
      VoxelManager.createImageVolumeVoxelManager({
        dimensions,
        imageIds,
        numberOfComponents,
      });

    this.numVoxels =
      this.dimensions[0] * this.dimensions[1] * this.dimensions[2];

    if (!imageData) {
      imageData = vtkImageData.newInstance();
      imageData.setDimensions(dimensions);
      imageData.setSpacing(spacing);
      imageData.setDirection(direction);
      imageData.setOrigin(origin);
    }

    imageData.set({
      dataType: dataType,
      voxelManager: this.voxelManager,
      id: volumeId,
      numberOfComponents: numberOfComponents || 1,
    });

    // imageData.getPointData = () => {
    //   console.warn(
    //     'Scalar data is not available, you need to use voxelManager to get scalar data'
    //   );
    //   return imageData.getPointData();
    // };

    // // make it impossible to get the scalar data from the imageData
    // imageData.getPointData().getScalars = () => {
    //   throw new Error(
    //     'Scalar data is not available, you need to use voxelManager to get scalar data'
    //   );
    // };

    imageData.set({
      hasScalarVolume: false,
    });
    // } else {
    //   // IMPORTANT: We strongly discourage using this method to set
    //   // scalar data as it will break the consistency of the volume data
    //   // and the voxel manager, however for testing and debugging purposes
    //   // we can provide the scalar data directly to the imageVolume
    //   // and here we are setting the scalar data directly to the imageData
    //   const dataArrayAttrs = {
    //     numberOfComponents: this.voxelManager.numberOfComponents || 1,
    //     dataType: this.dataType,
    //   };

    //   const scalarArray = vtkDataArray.newInstance({
    //     name: `Pixels`,
    //     values: scalarData,
    //     ...dataArrayAttrs,
    //   });

    //   imageData.getPointData().setScalars(scalarArray);

    //   imageData.set({
    //     hasScalarVolume: true,
    //   });
    // }

    this.imageData = imageData;

    this.numFrames = this._getNumFrames();
    this._reprocessImageIds();

    if (scaling) {
      this.scaling = scaling;
    }

    if (referencedVolumeId) {
      this.referencedVolumeId = referencedVolumeId;
    }

    if (referencedImageIds) {
      this.referencedImageIds = referencedImageIds;
    }

    if (additionalDetails) {
      this.additionalDetails = additionalDetails;
    }
  }

  public get sizeInBytes(): number {
    return this.voxelManager.sizeInBytes;
  }

  /** return the image ids for the volume if it is made of separated images */
  public get imageIds(): Array<string> {
    return this._imageIds;
  }

  /** updates the image ids */
  public set imageIds(newImageIds: Array<string>) {
    this._imageIds = newImageIds;
    this._reprocessImageIds();
  }

  private _reprocessImageIds() {
    this._imageIdsIndexMap.clear();
    this._imageURIsIndexMap.clear();

    this._imageIds.forEach((imageId, i) => {
      const imageURI = imageIdToURI(imageId);

      this._imageIdsIndexMap.set(imageId, i);
      this._imageURIsIndexMap.set(imageURI, i);
    });
  }

  cancelLoading: () => void;

  /** return true if it is a 4D volume or false if it is 3D volume */
  public isDynamicVolume(): boolean {
    return this.numTimePoints > 1;
  }

  /**
   * return the index of a given imageId
   * @param imageId - imageId
   * @returns imageId index
   */
  public getImageIdIndex(imageId: string): number {
    return this._imageIdsIndexMap.get(imageId);
  }

  public getImageIdByIndex(imageIdIndex: number): string {
    return this._imageIds[imageIdIndex];
  }

  /**
   * return the index of a given imageURI
   * @param imageId - imageURI
   * @returns imageURI index
   */
  public getImageURIIndex(imageURI: string): number {
    return this._imageURIsIndexMap.get(imageURI);
  }

  /**
   * destroy the volume and make it unusable
   */
  destroy(): void {
    // TODO: GPU memory associated with volume is not cleared.
    this.imageData.delete();
    this.imageData = null;
    this.voxelManager.clear();

    this.vtkOpenGLTexture.releaseGraphicsResources();
    this.vtkOpenGLTexture.delete();
  }

  /**
   * Updates the internals of the volume to reflect the changes in the
   * underlying scalar data. This should be called when the scalar data
   * is modified externally
   */
  public modified() {
    this.imageData.modified();
    this.vtkOpenGLTexture.modified();

    if (this.isDynamicVolume()) {
      throw new Error('Not implemented');
    } else {
      // if (this.scalarDataProp) {
      //   this.scalarDataProp = this.imageData
      //     .getPointData()
      //     .getScalars()
      //     .getData() as PixelDataTypedArray;
      // }
    }

    this.numFrames = this._getNumFrames();
  }

  public removeFromCache() {
    cache.removeVolumeLoadObject(this.volumeId);
  }

  public getScalarDataLength(): number {
    return this.voxelManager.getScalarDataLength();
  }

  /**
   * Returns the number of frames stored in a scalarData object. The number of
   * frames is equal to the number of images for 3D volumes or the number of
   * frames per time poins for 4D volumes.
   * @returns number of frames per volume
   */
  private _getNumFrames(): number {
    if (!this.isDynamicVolume()) {
      return this.imageIds.length;
    }

    return this.numTimePoints;
  }

  /**
   * Converts imageIdIndex into frameIndex which will be the same
   * for 3D volumes but different for 4D volumes. The indices are 0 based.
   */
  protected imageIdIndexToFrameIndex(imageIdIndex: number): number {
    return imageIdIndex % this.numFrames;
  }

  /**
   * Returns an array of all the volume's images as Cornerstone images.
   * It iterates over all the imageIds and converts them to Cornerstone images.
   *
   * @returns An array of Cornerstone images.
   */
  public getCornerstoneImages(): IImage[] {
    const { imageIds } = this;

    return imageIds.map((imageId) => {
      return cache.getImage(imageId);
    });
  }
}

export default ImageVolume;
