import { Point3, Scaling, IImage } from '../types';

type CPUImageData = {
  worldToIndex?: (point: Point3) => Point3;
  indexToWorld?: (point: Point3) => Point3;
  getWorldToIndex?: () => Point3;
  getIndexToWorld?: () => Point3;
  /** Last spacing is always EPSILON */
  getSpacing?: () => Point3;
  getDirection?: () => Float32Array;
  getScalarData?: () => number[];
  /** Last index is always 1 */
  getDimensions?: () => Point3;
};

type CPUIImageData = {
  dimensions: Point3;
  direction: Float32Array;
  spacing: Point3;
  origin: Point3;
  imageData: CPUImageData;
  metadata: { Modality: string };
  scalarData: number[];
  /** cornerstone image object */
  image: IImage;
  scaling: Scaling;
  /** whether the image has pixel spacing and it is not undefined */
  hasPixelSpacing?: boolean;
  /** preScale object */
  preScale?: {
    enabled?: boolean;
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
