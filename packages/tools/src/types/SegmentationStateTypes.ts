import { SegmentationRepresentation } from './SegmentationRepresentationTypes'

import type { LabelmapConfig } from '../tools/displayTools/Labelmap/LabelmapConfig'

/**
 * Four elements RGBA as 0-255
 */
export type Color = [number, number, number, number]

/**
 * Color LUT Array - Array of colors
 * [[0,0,0,0], [200,200,200,200], ....]
 */
export type ColorLUT = Array<Color>

/**
 * Representation Config
 */
export type RepresentationConfig = LabelmapConfig

/**
 * Segmentation Config
 */
export type SegmentationConfig = {
  /** Whether to render Inactive segmentations  */
  renderInactiveSegmentations: boolean
  /** Representations configuration */
  representations: {
    /** labelmap configuration */
    LABELMAP?: LabelmapConfig
  }
}

/**
 * Global Segmentation Data which is used for the segmentation
 */
export type GlobalSegmentationData = {
  /** volume UID of the segmentation in the cache */
  volumeUID: string
  /** segmentation label */
  label: string
  /** volumeUID of the data that the segmentation was derived from - if any */
  referenceVolumeUID?: string
  /** imageId of the image that the segmentation was derived from - if any */
  referenceImageId?: string
  /**
   * Active segment index in the segmentation, this index will get used
   * inside the segmentation tools
   */
  activeSegmentIndex: number
  /**
   * Locked segments in the segmentation, if a segment is locked no tool
   * will be able to modify it
   */
  segmentsLocked: Set<number>
  /**
   * If there is any derived statistics for the segmentation (e.g., mean, volume, etc)
   */
  cachedStats: { [key: string]: number }
}

/**
 * Global Segmentation State which is array of global segmentation data
 */
export type GlobalSegmentationState = GlobalSegmentationData[]

/**
 * Global Segmentation State with the shared config for all the segmentations
 */
export type GlobalSegmentationStateWithConfig = {
  /** Global segmentation state */
  segmentations: GlobalSegmentationState
  /** shared config for all the segmentations */
  config: SegmentationConfig
}

/**
 * ToolGroup Specific Segmentation Data for segmentations. As one segmentation
 * can be represented in various ways (currently only labelmap is supported)
 * we store ToolGroup specific segmentation data in this object
 */
export type ToolGroupSpecificSegmentationData = {
  /**
   * VolumeUID for the segmentation
   */
  volumeUID: string
  /**
   * unique id for this segmentationData in this viewport which will be `{volumeUID}-{representationType}`
   */
  segmentationDataUID: string
  /**
   * Whether the segmentation is the active (manipulatable) segmentation or not
   * which means it is inactive
   */
  active: boolean
  /**
   * Hidden segment indices in the segmentation
   */
  segmentsHidden: Set<number>
  /**
   * Whether the segmentation is visible
   */
  visibility: boolean
  /**
   * The index of the colorLUT from the state that this segmentationData is
   * using to render
   */
  colorLUTIndex: number
  /**
   * The representation type and representation config for this segmentation
   */
  representation: SegmentationRepresentation
}

/**
 * ToolGroup Specific Segmentation State which is array of ToolGroup specific segmentation data
 */
export type ToolGroupSpecificSegmentationState =
  ToolGroupSpecificSegmentationData[]

/**
 * ToolGroup Specific Segmentation State with the shared config for all the segmentations
 * in the toolGroup
 */
export type ToolGroupSpecificSegmentationStateWithConfig = {
  segmentations: ToolGroupSpecificSegmentationState
  config: SegmentationConfig
}

/**
 * Segmentation State. It stores both the global and the toolGroup specific
 * segmentation data and the shared config for all the segmentations in the
 * toolGroup and the global segmentation data.
 *
 * An example of segmentation state looks like
 * @example
 * ```js
 *  {
 *   colorLUT: [],
 *   global: {
 *     segmentations: [
 *       {
 *         volumeUID: 'labelmapUID2',
 *         label: 'label1',
 *         referenceVolumeUID: 'referenceVolumeName',
 *         referenceImageId: 'referenceImageId',
 *         activeSegmentIndex: 1,
 *         segmentsLocked: Set(),
 *         cacheStats: {},
 *       },
 *       {
 *         volumeUID: 'labelmapUID2',
 *         label: 'label1',
 *         referenceVolumeUID: 'referenceVolumeName',
 *         referenceImageId: 'referenceImageId',
 *         activeSegmentIndex: 1,
 *         segmentsLocked: Set(),
 *         cacheStats: {},
 *       },
 *     ],
 *   config: {
 *       renderInactiveSegmentations: true,
 *       representations:{
 *         LABELMAP: {
 *           renderOutline: true,
 *           outlineWidth: 3,
 *           outlineWidthActive: 3,
 *           outlineWidthInactive: 2,
 *           renderFill: true,
 *           fillAlpha: 0.9,
 *           fillAlphaInactive: 0.85,
 *         }
 *       }
 *       }
 *     }
 *   },
 *   toolGroups: {
 *     toolGroupUID1: {
 *       segmentations: [
 *         {
 *           volumeUID: 'labelmapUID1',
 *           segmentationDataUID: "123123"
 *           active: true,
 *           colorLUTIndex: 0,
 *           visibility: true,
 *           segmentsHidden: Set(),
 *           representation: {
 *             type: "labelmap"
 *             config: {
 *              cfun: cfun,
 *              ofun: ofun,
 *             },
 *           }
 *         },
 *         {
 *           volumeUID: 'labelmapUID1',
 *           segmentationDataUID: "5987123"
 *           colorLUTIndex: 1,
 *           visibility: true,
 *           segmentsHidden: Set(),
 *           representation: {
 *             type: "labelmap"
 *             config: {
 *              cfun: cfun,
 *              ofun: ofun,
 *             },
 *           }
 *         },
 *       ],
 *     ],
 *       config: {
 *         renderInactiveSegmentations: true,
 *         representations:{
 *           LABELMAP: {
 *           renderOutline: false,
 *         }
 *         }
 *       }
 *     },
 *     toolGroup2: {
 *       //
 *     }
 *   },
 *   },
 * }
 */
export interface SegmentationState {
  /** Array of colorLUT for segmentation to render */
  colorLutTables: ColorLUT[]
  /** global segmentation state with config */
  global: GlobalSegmentationStateWithConfig
  /**
   * ToolGroup specific segmentation state with config
   */
  toolGroups: {
    /** toolGroupId and their toolGroup specific segmentation state with config */
    [key: string]: ToolGroupSpecificSegmentationStateWithConfig
  }
}

/**
 * SegmentationDataInput that is used to add a segmentation to
 * a tooLGroup. It is partial of ToolGroupSpecificSegmentationData BUT REQUIRES volumeUID
 */
export type SegmentationDataInput =
  Partial<ToolGroupSpecificSegmentationData> & {
    toolGroupId: string
  }
