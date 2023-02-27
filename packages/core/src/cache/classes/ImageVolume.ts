import isTypedArray from '../../utilities/isTypedArray';
import { imageIdToURI } from '../../utilities';
import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses';
import {
  IVolume,
  VolumeScalarData,
  Metadata,
  Point3,
  IImageVolume,
  Mat3,
} from '../../types';

/** The base class for volume data. It includes the volume metadata
 * and the volume data along with the loading status.
 */
export class ImageVolume implements IImageVolume {
  private _imageIds: Array<string>;
  private _imageIdsIndexMap = new Map();
  private _imageURIsIndexMap = new Map();
  /** volume scalar data 3D or 4D */
  protected scalarData: VolumeScalarData | Array<VolumeScalarData>;

  /** Read-only unique identifier for the volume */
  readonly volumeId: string;
  /** Dimensions of the volume */
  dimensions: Point3;
  /** volume direction in world space */
  direction: Mat3;
  /** volume metadata */
  metadata: Metadata;
  /** volume origin, Note this is an opinionated origin for the volume */
  origin: Point3;
  /** Whether preScaling has been performed on the volume */
  isPrescaled = false;
  /** volume scaling parameters if it contains scaled data */
  scaling?: {
    PET?: {
      // @TODO: Do these values exist?
      SUVlbmFactor?: number;
      SUVbsaFactor?: number;
      // accessed in ProbeTool
      suvbwToSuvlbm?: number;
      suvbwToSuvbsa?: number;
    };
  };
  /** volume size in bytes */
  sizeInBytes?: number; // Seems weird to pass this in? Why not grab it from scalarData.byteLength
  /** volume spacing in 3d world space */
  spacing: Point3;
  /** volume number of voxels */
  numVoxels: number;
  /** volume image data */
  imageData?: any;
  /** open gl texture for the volume */
  vtkOpenGLTexture: any; // No good way of referencing vtk classes as they aren't classes.
  /** load status object for the volume */
  loadStatus?: Record<string, any>;
  /** optional reference volume id if the volume is derived from another volume */
  referencedVolumeId?: string;
  /** whether the metadata for the pixel spacing is not undefined  */
  hasPixelSpacing: boolean;

  constructor(props: IVolume) {
    this.volumeId = props.volumeId;
    this.metadata = props.metadata;
    this.dimensions = props.dimensions;
    this.spacing = props.spacing;
    this.origin = props.origin;
    this.direction = props.direction;
    this.imageData = props.imageData;
    this.scalarData = props.scalarData;
    this.sizeInBytes = props.sizeInBytes;
    this.vtkOpenGLTexture = vtkStreamingOpenGLTexture.newInstance();
    this.numVoxels =
      this.dimensions[0] * this.dimensions[1] * this.dimensions[2];

    if (props.scaling) {
      this.scaling = props.scaling;
    }

    if (props.referencedVolumeId) {
      this.referencedVolumeId = props.referencedVolumeId;
    }
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
    return false;
  }

  /**
   * Return the scalar data for 3D volumes or the active scalar data
   * (current time point) for 4D volumes
   */
  public getScalarData(): VolumeScalarData {
    if (isTypedArray(this.scalarData)) {
      return <VolumeScalarData>this.scalarData;
    }

    throw new Error('Unknow scalar data type');
  }

  /**
   * return the index of a given imageId
   * @param imageId - imageId
   * @returns imageId index
   */
  public getImageIdIndex(imageId: string): number {
    return this._imageIdsIndexMap.get(imageId);
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
    this.vtkOpenGLTexture.delete();
    this.scalarData = null;
  }
}

export default ImageVolume;
