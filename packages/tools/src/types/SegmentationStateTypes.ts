import type { Types } from '@cornerstonejs/core';
import type * as Enums from '../enums';
import type { ContourSegmentationData } from './ContourTypes';
import type { LabelmapSegmentationData } from './LabelmapTypes';
import type { SurfaceSegmentationData } from './SurfaceTypes';
import type vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import type vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

export type RepresentationsData = {
  [Enums.SegmentationRepresentations.Labelmap]?: LabelmapSegmentationData;
  [Enums.SegmentationRepresentations.Contour]?: ContourSegmentationData;
  [Enums.SegmentationRepresentations.Surface]?: SurfaceSegmentationData;
};

export type RepresentationData =
  | LabelmapSegmentationData
  | ContourSegmentationData
  | SurfaceSegmentationData;

/**
 * Global Segmentation Data which is used for the segmentation
 */
export type Segmentation = {
  /** segmentation id  */
  segmentationId: string;
  /** segmentation label */
  label: string;
  /**
   * Active segment index in the segmentation, this index will get used
   * inside the segmentation tools
   */
  activeSegmentIndex: number;
  /**
   * Locked segments in the segmentation, if a segment is locked no tool
   * will be able to modify it
   */
  segmentsLocked: Set<number>;
  /**
   * If there is any derived statistics for the segmentation (e.g., mean, volume, etc)
   */
  cachedStats: { [key: string]: number };
  /** segment labels */
  segmentLabels: { [key: string]: string };
  /**
   * Representations of the segmentation. Each segmentation "can" be viewed
   * in various representations. For instance, if a DICOM SEG is loaded, the main
   * representation is the labelmap. However, for DICOM RT the main representation
   * is contours, and other representations can be derived from the contour (currently
   * only labelmap representation is supported)
   */
  representationData: RepresentationsData;
};

type BaseRenderingConfig = {
  colorLUTIndex: number;
};

export type LabelmapRenderingConfig = BaseRenderingConfig & {
  cfun: vtkColorTransferFunction;
  ofun: vtkPiecewiseFunction;
};

export type ContourRenderingConfig = BaseRenderingConfig & {};

export type SurfaceRenderingConfig = BaseRenderingConfig & {};

export type RenderingConfig =
  | LabelmapRenderingConfig
  | ContourRenderingConfig
  | SurfaceRenderingConfig;

type BaseSegmentationRepresentation = {
  // identifier for the segmentation representation
  segmentationId: string;
  type: Enums.SegmentationRepresentations;
  // settings
  visible: boolean;
  active: boolean;
  segmentsHidden: Set<number>;
  /** rendering config for display of this representation */
};

export type SegmentationRepresentation = BaseSegmentationRepresentation & {
  config: RenderingConfig;
};

export type LabelmapRepresentation = SegmentationRepresentation & {
  config: LabelmapRenderingConfig;
};

export type ContourRepresentation = SegmentationRepresentation & {
  config: ContourRenderingConfig;
};

export type SurfaceRepresentation = SegmentationRepresentation & {
  config: SurfaceRenderingConfig;
};

export type SegmentationState = {
  /** Array of colorLUT for segmentation to render */
  colorLUT: Types.ColorLUT[];
  /** segmentations */
  segmentations: Segmentation[];
  /** viewports association with segmentation representations */
  viewportSegRepresentations: {
    [viewportId: string]: Array<SegmentationRepresentation>;
  };
};

export type SegmentationPublicInput = {
  segmentationId: string;
  representation: {
    type: Enums.SegmentationRepresentations;
    data?: RepresentationData;
  };
};

/**
 * Represents the input structure for adding a segmentation to a viewport.
 */
export type RepresentationPublicInput = {
  /** The unique identifier for the segmentation. */
  segmentationId: string;
  type?: Enums.SegmentationRepresentations;
  config?: {
    colorLUT?: Types.ColorLUT[];
  };
};
