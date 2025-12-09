import type Point2 from '../../../core/src/types/Point2';
import type Point3 from '../../../core/src/types/Point3';
import type IImageCalibration from '../../../core/src/types/IImageCalibration';
export interface ImagePlaneModule {
  columnCosines?: Point3;
  columnPixelSpacing?: number;
  imageOrientationPatient?: number[] | Float32Array;
  imagePositionPatient?: Point3;
  pixelSpacing?: Point2;
  rowCosines?: Point3;
  rowPixelSpacing?: number;
  sliceLocation?: number;
  sliceThickness?: number;
  spacingBetweenSlices?: number;
  pixelPaddingValue?: number;
  frameOfReferenceUID: string;
  columns: number;
  rows: number;
  usingDefaultValues?: boolean;
  calibration?: IImageCalibration;
}
