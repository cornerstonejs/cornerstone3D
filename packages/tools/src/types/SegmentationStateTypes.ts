import type { Types } from '@cornerstonejs/core';
import * as Enums from '../enums';
import {
  ContourConfig,
  ContourRenderingConfig,
  ContourSegmentationData,
} from './ContourTypes';
import type {
  LabelmapConfig,
  LabelmapRenderingConfig,
  LabelmapSegmentationData,
} from './LabelmapTypes';
import {
  SurfaceSegmentationData,
  SurfaceRenderingConfig,
} from './SurfaceTypes';

export type SegmentSpecificRepresentationConfig = {
  [key: number | string]: RepresentationConfig;
};

export type RepresentationConfig = {
  /** labelmap configuration */
  LABELMAP?: LabelmapConfig;
  /** contour configuration */
  CONTOUR?: ContourConfig;
  /** surface configuration */
  SURFACE?: any;
};

export type SegmentationRepresentationConfig = {
  /** Whether to render Inactive segmentations  */
  renderInactiveSegmentations: boolean;
  /** Representations configuration */
  representations: RepresentationConfig;
};

export type SegmentationRepresentationData = {
  LABELMAP?: LabelmapSegmentationData;
  CONTOUR?: ContourSegmentationData;
  SURFACE?: SurfaceSegmentationData;
};

/**
 * Global Segmentation Data which is used for the segmentation
 */
export type Segmentation = {
  /** segmentation id  */
  segmentationId: string;
  /** segmentation main representation type */
  type: Enums.SegmentationRepresentations;
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
  segmentLabels: { [key: string]: string };
  /**
   * Representations of the segmentation. Each segmentation "can" be viewed
   * in various representations. For instance, if a DICOM SEG is loaded, the main
   * representation is the labelmap. However, for DICOM RT the main representation
   * is contours, and other representations can be derived from the contour (currently
   * only labelmap representation is supported)
   */
  representationData: SegmentationRepresentationData;
};

/**
 * Representation state of the segmentation which is common between all
 * representations (we don't need to separate these states for each representation)
 */
export type BaseSegmentationRepresentation = {
  /**
   * Segmentation Representation UID
   */
  segmentationRepresentationUID: string;
  /**
   * The segmentationId that this representation is derived from
   */
  segmentationId: string;
  /**
   * The representation type
   */
  type: Enums.SegmentationRepresentations;
  /**
   * Hidden segment indices in the segmentation
   */
  segmentsHidden: Set<number>;
  /**
   * The index of the colorLUT from the state that this segmentationData is
   * using to render
   */
  colorLUTIndex: number;
  /**
   * Poly Seg generated
   */
  polySeg?: {
    enabled: boolean;
    options?: any;
  };

  config: {
    default?: RepresentationConfig;
    overrides?: SegmentSpecificRepresentationConfig;
  };
};

/**
 * ToolGroup Specific Segmentation Data for segmentations. As one segmentation
 * can be represented in various ways (currently only labelmap is supported)
 * we store ToolGroup specific segmentation data in this object
 */
export type LabelmapRepresentation = BaseSegmentationRepresentation & {
  rendering: LabelmapRenderingConfig;
};

export type ContourRepresentation = BaseSegmentationRepresentation & {
  rendering: ContourRenderingConfig;
};

export type SurfaceRepresentation = BaseSegmentationRepresentation & {
  rendering: SurfaceRenderingConfig;
};

export type SegmentationRepresentation =
  | LabelmapRepresentation
  | ContourRepresentation
  | SurfaceRepresentation;

/**
 * Segmentation State stored inside the cornerstone3DTools
 *
 * ```js
 {
     colorLUT: [],
     globalConfig: {
       renderInactiveSegmentations: false,
       representations: {
         LABELMAP: {
           renderFill: true,
           renderOutline: true,
         },
       },
     },
     segmentations: {
      'segmentation1': {
        type: 'Labelmap',
        activeSegmentIndex: 0,
        segmentsLocked: new Set(),
        label: 'segmentation1',
        cachedStats: {},
        representationData: {
          LABELMAP: {
            volumeId: 'segmentation1',
          },
          CONTOUR: {
            geometryIds: ['contourSet1', 'contourSet2'],
          },
        },
      },
      'segmentation2': {
        type: 'Labelmap',
        activeSegmentIndex: 1,
        segmentsLocked: new Set(),
        label: 'segmentation2',
        cachedStats: {},
        representationData: {
          CONTOUR: {
            points: Float32Array,
          },
        },
      },
    },
     representations: {
      'segRepUID1': {
        segmentationId: 'segmentation1',
        type: 'Labelmap',
        active: true,
        colorLUTIndex: 0,
        segmentsHidden: new Set(),
        rendering: {
          cfun,
          ofun,
        },
        config: {
          default: {
            LABELMAP: {
              renderFill: true,
            },
          },
          segmentSpecific: {
            '0': {
              LABELMAP: {
                renderFill: false,
              },
            },
          },
        },
      },
    },
    viewports: {
      'viewport1': {
        'segRepUID': {
          visible: true,
        },
        'segRepUID2': {
          visible: false,
        },
      },
      'viewport2': {
        'segRepUID': {
          visible: true,
        },
        'segRepUID2': {
          visible: false,
        },
      },
    }

   }
 * ```
 */
export type SegmentationState = {
  /** Array of colorLUT for segmentation to render */
  colorLUT: Types.ColorLUT[];
  /** segmentations */
  segmentations: Segmentation[];
  /** global segmentation state with config */
  globalConfig: SegmentationRepresentationConfig;
  /**
   * ToolGroup specific segmentation state with config
   */
  representations: {
    [key: string]: SegmentationRepresentation;
  };
  /** viewports association with segmentation representations */
  viewports: {
    [viewportId: string]: {
      [segRepresentationUID: string]: {
        visible: boolean;
      };
    };
  };
};

export type SegmentationPublicInput = {
  segmentationId: string;
  representation: {
    type: Enums.SegmentationRepresentations;
    data?:
      | LabelmapSegmentationData
      | ContourSegmentationData
      | SurfaceSegmentationData;
  };
};

export type RepresentationPublicInput = {
  segmentationId: string;
  type: Enums.SegmentationRepresentations;
  options?: RepresentationPublicInputOptions;
};

export type RepresentationPublicInputOptions = {
  segmentationRepresentationUID?: string;
  // color lut to use for this representation (optional), it can
  // be either a colorLUT array or the index of the colorLUT in the state
  colorLUTOrIndex?: Types.ColorLUT | number;
  // whether to use polymorphic segmentation utilities to convert
  // from other representations to this representation
  polySeg?: {
    enabled: boolean;
    options?: any;
  };
};
