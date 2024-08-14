import type { vtkImageData } from '@kitware/vtk.js/Common/DataModel/ImageData';
import type Point3 from './Point3';
import type Metadata from './Metadata';
import type Mat3 from './Mat3';
import type { VoxelManager } from '../utilities';
import type {
  PixelDataTypedArray,
  PixelDataTypedArrayString,
} from './PixelDataTypedArray';
import type RGB from './RGB';

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

  /**
   * The new volume model which solely relies on the separate image data
   * and do not cache the volume data at all
   */
  voxelManager?: VoxelManager<number> | VoxelManager<RGB>;
  dataType: PixelDataTypedArrayString;

  /**
   * To be deprecated scalarData and sizeInBytes
   * which is the old model of allocating the volume data
   * and caching it in the volume object
   */
  scalarData?: PixelDataTypedArray | PixelDataTypedArray[];
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

  /** Number of components for scalar data in the volume */
  numberOfComponents?: number;
}

export type { VolumeProps };
