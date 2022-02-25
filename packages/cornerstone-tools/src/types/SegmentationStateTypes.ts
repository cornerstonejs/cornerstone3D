import { SegmentationRepresentation } from './SegmentationRepresentationTypes'

import type { LabelmapConfig } from '../tools/displayTools/Labelmap/LabelmapConfig'
/**
 * Color LUT State
 */

// RGBA as 0-255
export type Color = [number, number, number, number]
// [[0,0,0,0], [200,200,200,200], ....]
export type ColorLUT = Array<Color>

export type RepresentationConfig = LabelmapConfig
/**
 * Configurations
 */
export type SegmentationConfig = {
  renderInactiveSegmentations: boolean
  representations: {
    LABELMAP?: LabelmapConfig
    // Todo: Mesh: MeshConfig
  }
}

/**
 * Global State
 */
export type GlobalSegmentationData = {
  volumeUID: string
  label: string
  referenceVolumeUID?: string
  referenceImageId?: string
  activeSegmentIndex: number
  segmentsLocked: Set<number>
  cachedStats: { [key: string]: number }
}

export type GlobalSegmentationState = GlobalSegmentationData[]

export type GlobalSegmentationStateWithConfig = {
  segmentations: GlobalSegmentationState
  config: SegmentationConfig
}

/**
 * ToolGroup Specific State
 */

export type ToolGroupSpecificSegmentationData = {
  volumeUID: string
  // unique id for this segmentationData in this viewport which will be `{volumeUID}-{representationType}`
  // Todo: Do we need to have Global segmentationData UID? I don't think so. We only need per-viewport
  segmentationDataUID: string
  active: boolean
  segmentsHidden: Set<number>
  visibility: boolean
  colorLUTIndex: number
  representation: SegmentationRepresentation
}

export type ToolGroupSpecificSegmentationState =
  ToolGroupSpecificSegmentationData[]

export type ToolGroupSpecificSegmentationStateWithConfig = {
  segmentations: ToolGroupSpecificSegmentationState
  config: SegmentationConfig
}

/**
 * Segmentation State
 *
 * @example
 * ```
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
  colorLutTables: ColorLUT[]
  global: GlobalSegmentationStateWithConfig
  toolGroups: {
    [key: string]: ToolGroupSpecificSegmentationStateWithConfig
  }
}

// It is partial of ToolGroupSpecificSegmentationData BUT REQUIRES volumeUID
export type SegmentationDataInput =
  Partial<ToolGroupSpecificSegmentationData> & {
    toolGroupUID: string
  }
