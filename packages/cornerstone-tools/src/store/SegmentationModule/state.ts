import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'
import { ISegmentationConfig } from './segmentationConfig'
import { getEnabledElement } from '@ohif/cornerstone-render'
import { getActiveLabelmapIndex } from '.'

export type ViewportLabelmapState = {
  volumeUID: string
  segmentsHidden: Set<number>
  colorLUTIndex: number
  cfun: vtkColorTransferFunction
  ofun: vtkPiecewiseFunction
  labelmapConfig: Partial<ISegmentationConfig>
}

type LabelmapGlobalState = {
  volumeUID: string
  referenceVolumeUID?: string
  referenceImageId?: string
  activeSegmentIndex: number
  segmentsLocked: Set<number>
}

export type ViewportLabelmapsState = {
  activeLabelmapIndex: number
  labelmaps: ViewportLabelmapState[]
}

// [[0,0,0,0], [200,200,200,200], ....]
type ColorLUT = Array<[number, number, number, number]>

export interface SegmentationState {
  labelmaps: Array<LabelmapGlobalState>
  volumeViewports: { [key: string]: ViewportLabelmapsState }
  colorLutTables: Array<ColorLUT>
  stackViewports: any
}

const state: SegmentationState = {
  colorLutTables: [
    //[
    // ColorLUTTable-0
    // [0, 0, 0, 0],
    // [255, 0, 0, 255],
    // [0, 255, 0, 255],
    // [0, 0, 255, 255],
    // ...... ,
    //],
  ],
  labelmaps: [
    // {
    // 	volumeUID: "labelmapUID1",
    //  referenceVolumeUID: "referenceVolumeName", // volume viewport
    //  referenceImageId: "referenceImageId", // stack viewport
    // 	activeSegmentIndex: 1,
    //  segmentsLocked: Set(),
    // }
    // {
    // 	volumeUID: "labelmapUID2",
    //  referenceVolumeUID: "referenceVolumeName", // volume viewport
    //  referenceImageId: "referenceImageId", // stack viewport
    // 	activeSegmentIndex: 1,
    //  segmentsLocked: Set(),
    // }
  ],
  volumeViewports: {
    // viewportUID: {
    //   activeLabelmapUID: 1,
    //   labelmaps: [
    //     {
    //       volumeUID: 'labelmapUID1',
    //       colorLUTIndex: 0,
    //       cfun: cfun,
    //       ofun: ofun,
    //       segmentsHidden: Set(),
    //       labelmapConfig: {
    //         renderOutline: true,
    //         outlineWidth: 3,
    //         outlineWidthActive: 3,
    //         outlineWidthInactive: 2,
    //         renderFill: true,
    //         fillAlpha: 0.9,
    //         fillAlphaInactive: 0.85,
    //     },
    //     {
    //       volumeUID: 'labelmapUID2',
    //       colorLUTIndex: 0,
    //       cfun: cfun,
    //       ofun: ofun,
    //       segmentsHidden: Set(),
    //       labelmapConfig: {
    //         renderOutline: true,
    //         outlineWidth: 3,
    //         outlineWidthActive: 3,
    //         outlineWidthInactive: 2,
    //         renderFill: true,
    //         fillAlpha: 0.9,
    //         fillAlphaInactive: 0.85,
    //     },
    //     },
    //   ],
    // },
  },
  stackViewports: {
    // Not implemented yet
  },
}

/**
 * Returns the viewport specific labelmapsState for HTML element
 * @param canvas HTML Canvas
 * @returns ViewportLabelmapsState
 */
function getLabelmapsStateForElement(
  canvas: HTMLCanvasElement
): ViewportLabelmapsState {
  const enabledElement = getEnabledElement(canvas)

  if (!enabledElement) {
    return
  }

  const { sceneUID, viewportUID } = enabledElement

  // Todo: stack Viewport
  if (!sceneUID) {
    throw new Error('Stack Viewport segmentation not supported yet')
  }

  return getLabelmapsStateForViewportUID(viewportUID)
}

/**
 * Returns the viewport specific labelmapsState for a viewportUID
 * @param viewportUID viewportUID
 * @returns ViewportLabelmapsState
 */
function getLabelmapsStateForViewportUID(
  viewportUID: string
): ViewportLabelmapsState {
  return state.volumeViewports[viewportUID]
}

/**
 * Returns the viewport specific labelmapsState for HTML element
 * @param canvas HTML Canvas
 * @returns ViewportLabelmapsState
 */
function getGlobalStateForLabelmapUID(
  labelmapUID: string
): LabelmapGlobalState {
  return state.labelmaps.find(
    (labelmapState) => labelmapState.volumeUID === labelmapUID
  )
}

/**
 * Returns the viewport specific labelmapsState for HTML element
 * @param canvas HTML Canvas
 * @returns ViewportLabelmapsState
 */
function getActiveLabelmapStateForElement(
  canvas: HTMLCanvasElement
): ViewportLabelmapState | undefined {
  const activeLabelmapIndex = getActiveLabelmapIndex(canvas)
  const labelmapsState = getLabelmapsStateForElement(canvas)

  if (!labelmapsState) {
    return
  }

  return labelmapsState.labelmaps[activeLabelmapIndex]
}

/**
 * Sets the labelmap globalState, including {volumeUID, referenceVolumeUID,
 * referenceImageId, activeSegmentIndex, segmentsLocked}, if no state is given
 * it will create an empty default global state
 * @param labelmapUID labelmapUID
 * @param newState Global state of the labelmap
 * @param overwrite force overwriting already existing labelmapState
 */
function setLabelmapGlobalState(
  labelmapUID: string,
  newState: LabelmapGlobalState = {
    volumeUID: labelmapUID,
    referenceVolumeUID: null,
    referenceImageId: null,
    activeSegmentIndex: 1,
    segmentsLocked: new Set(),
  },
  overwrite = false
): void {
  const labelmapGLobalState = getGlobalStateForLabelmapUID(labelmapUID)
  if (labelmapGLobalState && !overwrite) {
    throw new Error(
      "Cannot overwrite already existing global state for labelmap, use 'overwrite' flag if necessary"
    )
  }

  const {
    referenceImageId,
    referenceVolumeUID,
    activeSegmentIndex,
    segmentsLocked,
  } = newState

  // Todo: I don't think the order in the global state of the labemaps matter, so just push, but double check
  state.labelmaps.push({
    volumeUID: labelmapUID,
    referenceVolumeUID,
    referenceImageId,
    activeSegmentIndex,
    segmentsLocked,
  })
}

/**
 * Sets the labelmap viewport-specific state
 *
 * @param viewportUID labelmapUID
 * @param labelmapUID labelmapUID
 * @param newState Global state of the labelmap
 * @param overwrite force overwriting already existing labelmapState
 */
function setLabelmapViewportSpecificState(
  viewportUID: string,
  labelmapUID: string,
  labelmapIndex = 0,
  newState: ViewportLabelmapState = {
    volumeUID: labelmapUID,
    segmentsHidden: new Set(),
    colorLUTIndex: 0,
    cfun: vtkColorTransferFunction.newInstance(),
    ofun: vtkPiecewiseFunction.newInstance(),
    labelmapConfig: {},
  },
  overwrite = false
): void {
  // Todo: check if there is a labelmapGlobalState
  const viewportLabelmapsState = getLabelmapsStateForViewportUID(viewportUID)

  const labelmapState = viewportLabelmapsState.labelmaps.find(
    (state) => state.volumeUID === labelmapUID
  )

  if (labelmapState && !overwrite) {
    throw new Error(
      "Cannot overwrite already existing viewport-specific state for labelmap, use 'overwrite' flag if necessary"
    )
  }

  const { segmentsHidden, colorLUTIndex, cfun, ofun, labelmapConfig } = newState

  viewportLabelmapsState.labelmaps[labelmapIndex] = {
    volumeUID: labelmapUID,
    segmentsHidden,
    colorLUTIndex,
    cfun,
    ofun,
    labelmapConfig,
  }
}

export default state
export {
  // get
  getLabelmapsStateForElement,
  getLabelmapsStateForViewportUID,
  getActiveLabelmapStateForElement,
  getGlobalStateForLabelmapUID,
  // set
  setLabelmapGlobalState,
  setLabelmapViewportSpecificState,
}
