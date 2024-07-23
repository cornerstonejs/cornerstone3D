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

export type SegmentRepresentationConfig = {
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
  renderInactiveRepresentations: boolean;
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
  /** base segmentation representation type - e.g., labelmap, contour, etc */
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
  /** segment labels */
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
  /** rendering config for display of this representation */
  config: {
    /** default configuration for the representation - applied to all segments*/
    allSegments?: RepresentationConfig;
    /**
     * segment specific configuration for the representation, might be different
     * for each segment. Use cases: to highligh a specific segment with a brighter
     * color
     */
    perSegment?: SegmentRepresentationConfig;
  };
};

/**
 * Labelmap representation of the segmentation
 */
export type LabelmapRepresentation = BaseSegmentationRepresentation & {
  rendering: LabelmapRenderingConfig;
};

/**
 * contour representation of the segmentation
 */
export type ContourRepresentation = BaseSegmentationRepresentation & {
  rendering: ContourRenderingConfig;
};

/**
 * Surface representation of the segmentation
 */
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
       renderInactiveRepresentations: false,
       representations: {
         LABELMAP: {
           renderFill: true,
           renderOutline: true,
         },
       },
     },
     segmentations: [
       {
         segmentationId: 'segmentation1',
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
       {
         segmentationId: 'segmentation2',
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
     ],
     representations: {
      'segRepUID1': {
        segmentationId: 'segmentation1',
        type: 'Labelmap',
        colorLUTIndex: 0,
        rendering: {
          cfun,
          ofun,
        },
        config: {
          allSegments: {
            LABELMAP: {
              renderFill: true,
            },
          },
          perSegment: {
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
          segmentsHidden: Set<number>;
          active: true,
        },
        'segRepUID2': {
          visible: false,
          active: false,
          segmentsHidden: Set<number>;
        },
      },
      'viewport2': {
        'segRepUID': {
          visible: true,
          active: false,
          segmentsHidden: Set<number>;
        },
        'segRepUID2': {
          visible: true,
          active: true,
          segmentsHidden: Set<number>;
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
        active: boolean;
        segmentsHidden: Set<number>;
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
