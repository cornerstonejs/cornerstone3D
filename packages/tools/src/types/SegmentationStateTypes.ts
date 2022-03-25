import SegmentationRepresentations from '../enums/SegmentationRepresentations'
import type { LabelmapConfig } from '../tools/displayTools/Labelmap/LabelmapConfig'
import {
  LabelmapMainRepresentation,
  LabelmapRenderingConfig,
} from './LabelmapTypes'

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
 * Segmentation Config
 */
export type SegmentationRepresentationConfig = {
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
export type Segmentation = {
  segmentationId: string
  type: SegmentationRepresentations
  /** segmentation label */
  label: string
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

  representations: {
    LABELMAP?: LabelmapMainRepresentation
  }
}

type RepresentationData = {
  segmentationRepresentationUID: string
  segmentationId: string
  type: SegmentationRepresentations
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
}

/**
 * ToolGroup Specific Segmentation Data for segmentations. As one segmentation
 * can be represented in various ways (currently only labelmap is supported)
 * we store ToolGroup specific segmentation data in this object
 */
export type ToolGroupSpecificSegmentationRepresentation = RepresentationData &
  LabelmapRenderingConfig // Todo: add more representations

export interface SegmentationState {
  /** Array of colorLUT for segmentation to render */
  colorLutTables: ColorLUT[]
  /** global segmentation state with config */
  globalConfig: SegmentationRepresentationConfig
  /**
   * ToolGroup specific segmentation state with config
   */
  toolGroups: {
    /** toolGroupId and their toolGroup specific segmentation state with config */
    [key: string]: {
      segmentationRepresentations: ToolGroupSpecificSegmentationRepresentation[]
      config: SegmentationRepresentationConfig
    }
  }
}

/**
 * SegmentationDataInput that is used to add a segmentation to
 * a tooLGroup. It is partial of ToolGroupSpecificSegmentationData BUT REQUIRES volumeId
 */
// export type SegmentationDataInput =
//   Partial<ToolGroupSpecificSegmentationData> & {
//     toolGroupId: string
//   }
