import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type Point3 from './Point3';
import type Metadata from './Metadata';
import Mat3 from './Mat3';
import { PixelDataTypedArray } from './PixelDataTypedArray';

/**
 * Interface for Volume representation in a 3D/4D context.
 * It includes metadata, scalar data, and various attributes
 * describing the volume.
 */
interface IVolume {
  /** this is here just not to break types, but it is basically always empty array */
  imageIds: string[];
  /** Read-only unique identifier for the volume */
  readonly volumeId: string;
  /** Indicates whether pre-scaling has been applied to the volume */
  isPreScaled: boolean;
  /** Indicates whether the volume has defined pixel spacing */
  hasPixelSpacing: boolean;
  /** Dimensions of the volume (width, height, depth) */
  dimensions: Point3;
  /** Direction of the volume in world space */
  direction: Mat3;
  /** Metadata associated with the volume */
  metadata: Metadata;
  /** Origin point of the volume in world space */
  origin: Point3;
  /** Scaling parameters if the volume contains scaled data */
  scaling?: {
    PT?: {
      SUVlbmFactor?: number;
      SUVbsaFactor?: number;
      suvbwToSuvlbm?: number;
      suvbwToSuvbsa?: number;
    };
  };
  /** Size of the volume data in bytes */
  sizeInBytes?: number;
  /** Spacing between volume points in 3D world space */
  spacing: Point3;
  /** Total number of voxels in the volume */
  numVoxels: number;
  /** Image data representing the volume */
  imageData?: vtkImageData;
  /** OpenGL texture for rendering the volume */
  vtkOpenGLTexture: any;
  /** Status of volume data loading */
  loadStatus?: Record<string, any>;
  /** Optional ID of a referenced volume if this volume is derived from another */
  referencedVolumeId?: string;

  cancelLoading(): void;

  /**
   * Returns all scalar data objects (buffers) which will be only one for
   * 3D volumes and one per time point for 4D volumes.
   * @returns An array of scalar data (typed arrays).
   */
  getScalarDataArrays(): PixelDataTypedArray[];

  /**
   * Determines whether the volume is dynamic (4D) or static (3D).
   * @returns True if it is a 4D volume, false if it is a 3D volume.
   */
  isDynamicVolume(): boolean;

  /**
   * Returns the scalar data for 3D volumes or the active scalar data
   * (current time point) for 4D volumes.
   * @returns The scalar data as a typed array.
   */
  getScalarData(): PixelDataTypedArray;

  /**
   * Destroys the volume and releases associated resources, making it unusable.
   */
  destroy(): void;

  /**
   * Removes the volume from the cache based on the provided parameter.
   * If completelyRemove is true, the volume is completely removed from the cache.
   * Otherwise, the volume is converted to cornerstone images (stack images) and stored in the cache.
   * @param completelyRemove - If true, the volume is removed completely from the cache.
   */
  decache(completelyRemove: boolean): void;

  /**
   * Protected method to remove the volume from the cache.
   */
  removeFromCache(): void;

  /**
   * Protected method to get the length of scalar data.
   * @returns The length of scalar data.
   */
  getScalarDataLength(): number;
}

export { IVolume };
