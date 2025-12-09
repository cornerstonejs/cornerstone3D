import type CalibrationTypes from '../enums/CalibrationTypes';
export interface IImageCalibration {
  rowPixelSpacing?: number;
  columnPixelSpacing?: number;
  scale?: number;
  aspect?: number;
  type: CalibrationTypes;
  tooltip?: string;
  sequenceOfUltrasoundRegions?: Record<string, unknown>[];
}
export type { IImageCalibration as default };
