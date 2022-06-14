import { Point3, Scaling } from '../types';

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
  scaling: Scaling;
  /** whether the image has pixel spacing and it is not undefined */
  hasPixelSpacing?: boolean;
};

export default CPUIImageData;

export { CPUImageData };
