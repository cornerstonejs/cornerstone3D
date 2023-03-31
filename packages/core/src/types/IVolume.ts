import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type Point3 from './Point3';
import type Metadata from './Metadata';
import Mat3 from './Mat3';

type VolumeScalarData = Float32Array | Uint8Array | Uint16Array | Int16Array;

/**
 * Cornerstone ImageVolume interface.
 */
interface IVolume {
  /** unique identifier for the volume in the cache */
  volumeId: string;
  /** volume metadata */
  metadata: Metadata;
  /** volume dimensions */
  dimensions: Point3;
  /** volume spacing */
  spacing: Point3;
  /** volume origin */
  origin: Point3;
  /** volume direction */
  direction: Mat3;
  /** volume scalarData */
  scalarData: VolumeScalarData | Array<VolumeScalarData>;
  /** volume size in bytes */
  sizeInBytes?: number;
  /** volume image data as vtkImageData */
  imageData?: vtkImageData;
  /** referencedVolumeId if volume is derived from another volume */
  referencedVolumeId?: string;
  /** volume scaling metadata */
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
}

export { IVolume as default, IVolume, VolumeScalarData };
