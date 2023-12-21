import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import isTypedArray from '../../utilities/isTypedArray';
import { vtkStreamingOpenGLTexture } from '../../RenderingEngine/vtkClasses';
import {
  IVolume,
  Metadata,
  Point3,
  Mat3,
  VolumeProps,
  PixelDataTypedArray,
} from '../../types';
import cache from '../cache';

/**
 * The Volume class serves as the foundation for volume data, encompassing both the volume metadata
 * and the volume data itself, along with its loading status. It's important to note that
 * the ImageVolume class is distinct from the Volume class. The ImageVolume class acts as a wrapper
 * around the Volume class, specifically designed for volumes that can be created from a
 * set of images. On the other hand, the Volume class is more versatile, accommodating
 * any type of volumetric data, such as nifti or nrrd, which may not necessarily involve images or imageIds.
 */
export class Volume implements IVolume {
  /** volume scalar data 3D or 4D */
  protected scalarData: PixelDataTypedArray | Array<PixelDataTypedArray>;
  /** Read-only unique identifier for the volume */
  readonly volumeId: string;

  /**
   * imageIds, Right now it is here since so many types break, but as you
   * see it is not used in the class at all. ImageVolume which wraps
   * Volume is the one that uses it and set it in the constructor itself
   */
  imageIds = null;
  isPreScaled = false;
  /** whether the metadata for the pixel spacing is not undefined  */
  hasPixelSpacing = true;

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
  /** volume size in bytes */
  sizeInBytes?: number; // Seems weird to pass this in? Why not grab it from scalarData.byteLength
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

  constructor(props: VolumeProps) {
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

  /**
   * cancel loading of the volume
   */
  public cancelLoading(): void {
    // do nothing
  }

  /**
   * Return all scalar data objects (buffers) which will be only one for
   * 3D volumes and one per time point for 4D volumes
   * images of each 3D volume is stored
   * @returns scalar data array
   */
  public getScalarDataArrays(): PixelDataTypedArray[] {
    return this.isDynamicVolume()
      ? <PixelDataTypedArray[]>this.scalarData
      : [<PixelDataTypedArray>this.scalarData];
  }

  /** return true if it is a 4D volume or false if it is 3D volume */
  public isDynamicVolume(): boolean {
    return false;
  }

  /**
   * Return the scalar data for 3D volumes or the active scalar data
   * (current time point) for 4D volumes
   */
  public getScalarData(): PixelDataTypedArray {
    if (isTypedArray(this.scalarData)) {
      return <PixelDataTypedArray>this.scalarData;
    }

    throw new Error('Unknown scalar data type');
  }

  /**
   * destroy the volume and make it unusable
   */
  public destroy(): void {
    // TODO: GPU memory associated with volume is not cleared.
    this.imageData.delete();
    this.imageData = null;
    this.scalarData = null;

    this.vtkOpenGLTexture.releaseGraphicsResources();
    this.vtkOpenGLTexture.delete();
  }

  /**
   * If completelyRemove is true, remove the volume completely from the cache. Otherwise,
   * convert the volume to cornerstone images (stack images) and store it in the cache
   * @param completelyRemove - If true, the image will be removed from the
   * cache completely.
   */
  public decache(completelyRemove = false): void {
    if (completelyRemove) {
      this.removeFromCache();
    }
  }

  public removeFromCache() {
    cache.removeVolumeLoadObject(this.volumeId);
  }

  public getScalarDataLength(): number {
    const { scalarData } = this;
    return this.isDynamicVolume()
      ? (<PixelDataTypedArray[]>scalarData)[0].length
      : (<PixelDataTypedArray>scalarData).length;
  }
}

export default Volume;
