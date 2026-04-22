import type { ViewportType } from '../enums';
import type Point2 from './Point2';

export interface InternalSlicerCamera {
  panWorld?: Point2;
  parallelScale?: number;
}

export interface SlicerViewportInput {
  id: string;
  renderingEngineId: string;
  type: ViewportType;
  element: HTMLDivElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: unknown;
  canvas: HTMLCanvasElement;
}

/**
 * Query-string params forwarded verbatim to the Slicer WebServer
 * `GET /slice` endpoint.
 */
export interface SlicerSliceParams {
  view?: 'red' | 'yellow' | 'green';
  orientation?: 'axial' | 'sagittal' | 'coronal';
  offset?: number;
  size?: number;
}

/**
 * Identifies a study that the Slicer backend should fetch directly
 * from a DICOMweb server via `DICOMUtils.importFromDICOMWeb`. When
 * `SeriesInstanceUID` is provided, only that series is imported;
 * otherwise every series in the study is imported.
 */
export interface SlicerDicomStudy {
  wadoRsRoot: string;
  StudyInstanceUID: string;
  SeriesInstanceUID?: string;
  accessToken?: string;
}

/**
 * Geometry of the currently loaded volume along the active orientation,
 * populated via a `POST /slicer/exec` Python query.
 */
export interface SlicerVolumeGeometry {
  numberOfSlices: number;
  sliceThickness: number;
  minOffset: number;
  maxOffset: number;
}
