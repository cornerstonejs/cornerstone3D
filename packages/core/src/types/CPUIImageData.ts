import type { Point3 } from './Point3';
import type { Scaling } from './ScalingParameters';
import type Mat3 from './Mat3';
import type { PixelDataTypedArray } from './PixelDataTypedArray';
import type RGB from './RGB';
import type { VoxelManager } from '../utilities';
import type IImageCalibration from './IImageCalibration';
import type { IVoxelManager } from './IVoxelManager';

interface CPUImageData {
  worldToIndex?: (point: Point3) => Point3;
  indexToWorld?: (point: Point3) => Point3;
  getWorldToIndex?: () => Point3;
  getIndexToWorld?: () => Point3;
  /** Last spacing is always EPSILON */
  getSpacing?: () => Point3;
  getDirection?: () => Mat3;
  getScalarData?: () => PixelDataTypedArray;
  /** Last index is always 1 */
  getDimensions?: () => Point3;
  getRange?: () => [number, number];
}

interface CPUIImageData {
  dimensions: Point3;
  direction: Mat3;
  spacing: Point3;
  numberOfComponents?: number;
  origin: Point3;
  imageData: CPUImageData;
  metadata: { Modality: string; FrameOfReferenceUID: string };
  scalarData: PixelDataTypedArray;
  scaling?: Scaling;
  /** whether the image has pixel spacing and it is not undefined */
  hasPixelSpacing?: boolean;
  calibration?: IImageCalibration;

  voxelManager?: IVoxelManager<number> | IVoxelManager<RGB>;
  preScale?: {
    /** boolean flag to indicate whether the image has been scaled */
    scaled?: boolean;
    /** scaling parameters */
    scalingParameters?: {
      /** modality of the image */
      modality?: string;
      /** rescale slop */
      rescaleSlope?: number;
      /** rescale intercept */
      rescaleIntercept?: number;
      /** PT suvbw */
      suvbw?: number;
    };
  };
}

export type { CPUIImageData as default };

export type { CPUImageData };
