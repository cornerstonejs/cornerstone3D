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

export type Segment = {
  /** segment index */
  segmentIndex: number;
  /** segment label */
  label: string;
  /** is segment locked for editing */
  locked: boolean;
  /** cached stats for the segment, e.g., pt suv mean, max etc. */
  cachedStats: { [key: string]: unknown };
  /** is segment active for editing, at the same time only one segment can be active for editing */
  active: boolean;
};

/**
 * Global Segmentation Data which is used for the segmentation
 */
export type Segmentation = {
  /** segmentation id  */
  segmentationId: string;
  /** segmentation label */
  label: string;
  segments: {
    [segmentIndex: number]: Segment;
  };
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

export type LabelmapRepresentation = BaseSegmentationRepresentation & {
  config: LabelmapRenderingConfig;
};

export type ContourRepresentation = BaseSegmentationRepresentation & {
  config: ContourRenderingConfig;
};

export type SurfaceRepresentation = BaseSegmentationRepresentation & {
  config: SurfaceRenderingConfig;
};

export type SegmentationRepresentation =
  | LabelmapRepresentation
  | ContourRepresentation
  | SurfaceRepresentation;

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
  config?: {
    segments?: {
      [segmentIndex: number]: Partial<Segment>;
    };
    label?: string;
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
