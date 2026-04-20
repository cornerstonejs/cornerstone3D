import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import imageIdToURI from '../../utilities/imageIdToURI';
import VoxelManager from '../../utilities/VoxelManager';
import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses';
import type {
  Metadata,
  Point3,
  Mat3,
  ImageVolumeProps,
  IImage,
  PixelDataTypedArrayString,
  RGB,
  IVoxelManager,
} from '../../types';
import cache from '../cache';
import type vtkOpenGLTexture from '@kitware/vtk.js/Rendering/OpenGL/Texture';

export interface vtkStreamingOpenGLTexture extends vtkOpenGLTexture {
  setUpdatedFrame: (frame: number) => void;
  setVolumeId: (volumeId: string) => void;
  releaseGraphicsResources: () => void;
  hasUpdatedFrames: () => boolean;
}

/** The base class for volume data. It includes the volume metadata
 * and the volume data along with the loading status.
 */
export class ImageVolume {
  private _imageIds: string[];
  private _imageIdsIndexMap = new Map();
  private _imageURIsIndexMap = new Map();
  /** volume scalar data 3D or 4D */
  protected totalNumFrames: number;
  protected cornerstoneImageMetaData = null;

  /** Read-only unique identifier for the volume */
  readonly volumeId: string;

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
  vtkOpenGLTexture: vtkStreamingOpenGLTexture;
  /** load status object for the volume */
  loadStatus?: Record<string, unknown>;
  /** optional reference volume id if the volume is derived from another volume */
  referencedVolumeId?: string;
  /** optional reference image ids if the volume is derived from a set of images in the image cache */
  referencedImageIds?: string[];
  /** whether the metadata for the pixel spacing is not undefined  */
  hasPixelSpacing: boolean;
  /** Property to store additional information */
  additionalDetails?: Record<string, unknown>;
  /**
   *  Property to store the number of dimension groups.
   * @deprecated
   */
  numDimensionGroups: number;

  /**
   * The new volume model which solely relies on the separate image data
   * and do not cache the volume data at all
   */
  voxelManager?: IVoxelManager<number> | IVoxelManager<RGB>;
  dataType?: PixelDataTypedArrayString;

  /**
   * Calculates the number of time points to be the number of dimension groups
   * as a fallback for existing handling.
   * @deprecated
   */
  get numTimePoints(): number {
    return typeof this.numDimensionGroups === 'number'
      ? this.numDimensionGroups
      : 1;
  }
  numFrames = null as number;
  suppressWarnings: boolean;

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

    this.suppressWarnings = true;
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
        id: volumeId,
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

    imageData.set(
      {
        dataType: dataType,
        voxelManager: this.voxelManager,
        id: volumeId,
        numberOfComponents: numberOfComponents || 1,
      },
      this.suppressWarnings
    );

    imageData.set(
      {
        hasScalarVolume: false,
      },
      this.suppressWarnings
    );

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
  public get imageIds(): string[] {
    return this._imageIds;
  }

  /** updates the image ids */
  public set imageIds(newImageIds: string[]) {
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
    if (this.numTimePoints) {
      return this.numTimePoints > 1;
    }

    return false;
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

  public load(callback?: (...args: unknown[]) => void): void {
    // TODO: Implement
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

  public invalidate() {
    for (let i = 0; i < this.imageIds.length; i++) {
      this.vtkOpenGLTexture.setUpdatedFrame(i);
    }

    this.imageData.modified();
  }

  /**
   * Updates the internals of the volume to reflect the changes in the
   * underlying scalar data. This should be called when the scalar data
   * is modified externally
   */
  public modified() {
    this.imageData.modified();
    this.vtkOpenGLTexture.modified();

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
