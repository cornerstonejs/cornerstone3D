import * as Enums from '../enums';
import { ContourConfig, ContourSegmentationData } from './ContourTypes';
import type {
  LabelmapConfig,
  LabelmapSegmentationData,
  LabelmapRenderingConfig,
} from './LabelmapTypes';

/**
 * Four elements RGBA as 0-255
 */
export type Color = [number, number, number, number];

/**
 * Color LUT Array - Array of colors
 * [[0,0,0,0], [200,200,200,200], ....]
 */
export type ColorLUT = Array<Color>;

export type SegmentSpecificRepresentationConfig = {
  [key: number]: RepresentationConfig;
};
/**
 * Segmentation Config
 */

export type RepresentationConfig = {
  /** labelmap configuration */
  LABELMAP?: LabelmapConfig;
  /** contour configuration */
  CONTOUR?: ContourConfig;
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
export type ToolGroupSpecificRepresentationState = {
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
   * Whether the segmentation is the active (manipulatable) segmentation or not
   * which means it is inactive
   */
  active: boolean;
  /**
   * Hidden segment indices in the segmentation
   */
  segmentsHidden: Set<number>;
  /**
   * Whether the segmentation is visible
   */
  visibility: boolean;
  /**
   * The index of the colorLUT from the state that this segmentationData is
   * using to render
   */
  colorLUTIndex: number;
};

/**
 * ToolGroup Specific Segmentation Data for segmentations. As one segmentation
 * can be represented in various ways (currently only labelmap is supported)
 * we store ToolGroup specific segmentation data in this object
 */
export type ToolGroupSpecificLabelmapRepresentation =
  ToolGroupSpecificRepresentationState & {
    config: LabelmapRenderingConfig;
    // Todo: we need to merge all these configs into one to make it easier
    segmentationRepresentationSpecificConfig?: RepresentationConfig;
    segmentSpecificConfig?: SegmentSpecificRepresentationConfig;
  };

export type ToolGroupSpecificContourRepresentation =
  ToolGroupSpecificRepresentationState & {
    config: LabelmapRenderingConfig;
    segmentationRepresentationSpecificConfig?: RepresentationConfig;
    segmentSpecificConfig?: SegmentSpecificRepresentationConfig;
  };

export type ToolGroupSpecificRepresentation =
  ToolGroupSpecificLabelmapRepresentation; // | other ones

export type ToolGroupSpecificRepresentations =
  Array<ToolGroupSpecificRepresentation>;

/**
 * Segmentation State stored inside the cornerstone3DTools
 *
 * ```js
 *  {
 *   colorLUT: [],
 *   globalConfig: {
 *     renderInactiveSegmentations: false,
 *     representations: {
 *       LABELMAP: {
 *         renderFill: true,
 *         renderOutline: true,
 *       },
 *     },
 *   },
 *   segmentations: [
 *     {
 *       segmentationId: 'segmentation1',
 *       mainType: 'Labelmap',
 *       activeSegmentIndex: 0,
 *       segmentsLocked: new Set(),
 *       label: 'segmentation1',
 *       cachedStats: {},
 *       representationData: {
 *         LABELMAP: {
 *           volumeId: 'segmentation1',
 *         },
 *         CONTOUR: {
 *           geometryIds: ['contourSet1', 'contourSet2'],
 *         },
 *       },
 *     },
 *     {
 *       segmentationId: 'segmentation2',
 *       type: 'Labelmap',
 *       activeSegmentIndex: 1,
 *       segmentsLocked: new Set(),
 *       label: 'segmentation2',
 *       cachedStats: {},
 *       representationData: {
 *         CONTOUR: {
 *           points: Float32Array,
 *         },
 *       },
 *     },
 *   ],
 *   toolGroups: {
 *     toolGroupUID1: {
 *       segmentationRepresentations: [
 *         {
 *           segmentationRepresentationUID: '12123123123132',
 *           segmentationId: '123123',
 *           type: 'Labelmap',
 *           active: true,
 *           colorLUTIndex: 0,
 *           visibility: true,
 *           segmentsHidden: Set(),
 *           // LabelmapRenderingConfig
 *           config: {
 *             "cfun",
 *             "ofun",
 *           },
 *         },
 *       ],
 *       config: {
 *         renderInactiveSegmentations: false,
 *         representations: {
 *           LABELMAP: {
 *             renderFill: true,
 *             renderOutline: true,
 *           },
 *         },
 *       },
 *     },
 *   },
 * }
 * ```
 */
export type SegmentationState = {
  /** Array of colorLUT for segmentation to render */
  colorLUT: ColorLUT[];
  /** segmentations */
  segmentations: Segmentation[];
  /** global segmentation state with config */
  globalConfig: SegmentationRepresentationConfig;
  /**
   * ToolGroup specific segmentation state with config
   */
  toolGroups: {
    /** toolGroupId and their toolGroup specific segmentation state with config */
    [key: string]: {
      segmentationRepresentations: ToolGroupSpecificRepresentations;
      config: SegmentationRepresentationConfig;
    };
  };
};

export type SegmentationPublicInput = {
  segmentationId: string;
  representation: {
    type: Enums.SegmentationRepresentations;
    data: LabelmapSegmentationData | ContourSegmentationData;
  };
};

export type RepresentationPublicInput = {
  segmentationId: string;
  type: Enums.SegmentationRepresentations;
};
