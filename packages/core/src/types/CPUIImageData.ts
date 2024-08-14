import type { Point3 } from './Point3';
import type { Scaling } from './ScalingParameters';
import type Mat3 from './Mat3';
import type { PixelDataTypedArray } from './PixelDataTypedArray';
import type RGB from './RGB';
import { VoxelManager } from '../utilities';
import IImageCalibration from './IImageCalibration';

type CPUImageData = {
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
};

type CPUIImageData = {
  dimensions: Point3;
  direction: Mat3;
  spacing: Point3;
  origin: Point3;
  imageData: CPUImageData;
  metadata: { Modality: string; FrameOfReferenceUID: string };
  scalarData: PixelDataTypedArray;
  scaling: Scaling;
  /** whether the image has pixel spacing and it is not undefined */
  hasPixelSpacing?: boolean;
  calibration?: IImageCalibration;

  voxelManager?: VoxelManager<number> | VoxelManager<RGB>;
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
};

export default CPUIImageData;

export { CPUImageData };
