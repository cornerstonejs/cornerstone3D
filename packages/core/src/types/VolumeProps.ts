import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type Point3 from './Point3';
import type Metadata from './Metadata';
import Mat3 from './Mat3';
import { PixelDataTypedArray } from './PixelDataTypedArray';

/**
 * Properties required to instantiate a Volume object.
 * This includes all the necessary data and metadata to define
 * a volume in 3D/4D space.
 */
interface VolumeProps {
  /** Unique identifier for the volume */
  volumeId: string;

  /** Metadata describing the volume */
  metadata: Metadata;

  /** Dimensions of the volume (width, height, depth) */
  dimensions: Point3;

  /** Spacing between volume points in 3D world space */
  spacing: Point3;

  /** Origin point of the volume in world space */
  origin: Point3;

  /** Direction of the volume in world space */
  direction: Mat3;

  /** Image data representing the volume */
  imageData?: vtkImageData;

  /** Scalar data representing the volume's intensity values */
  scalarData: PixelDataTypedArray | Array<PixelDataTypedArray>;

  /** Size of the volume data in bytes (optional) */
  sizeInBytes?: number;

  /** Property to store additional information */
  additionalDetails?: Record<string, any>;

  /** Scaling parameters if the volume contains scaled data (optional) */
  scaling?: {
    PT?: {
      SUVlbmFactor?: number;
      SUVbsaFactor?: number;
      suvbwToSuvlbm?: number;
      suvbwToSuvbsa?: number;
    };
  };

  /** Optional ID of a referenced volume if this volume is derived from another */
  referencedVolumeId?: string;
}

export { VolumeProps };
