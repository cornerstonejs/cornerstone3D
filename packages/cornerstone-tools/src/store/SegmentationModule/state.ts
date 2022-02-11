import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'
import { ISegmentationConfig } from './segmentationConfig'
import {
  getEnabledElement,
  VolumeViewport,
} from '@precisionmetrics/cornerstone-render'
import { getActiveLabelmapIndex } from './activeLabelmapController'
import { setColorLUT } from './colorLUT'
import { triggerLabelmapStateUpdated } from './triggerLabelmapStateUpdated'

type LabelmapGlobalState = {
  volumeUID: string
  label: string
  referenceVolumeUID?: string
  cachedStats: { [key: string]: number }
  referenceImageId?: string
  activeSegmentIndex: number
  segmentsLocked: Set<number>
}

export type ViewportLabelmapsState = {
  activeLabelmapIndex: number
  labelmaps: ViewportLabelmapState[]
}

export type ViewportLabelmapState = {
  volumeUID: string
  segmentsHidden: Set<number>
  visibility: boolean
  colorLUTIndex: number
  cfun: vtkColorTransferFunction
  ofun: vtkPiecewiseFunction
  labelmapConfig: Partial<ISegmentationConfig>
}

// RGBA as 0-255
export type Color = [number, number, number, number]

// [[0,0,0,0], [200,200,200,200], ....]
export type ColorLUT = Array<Color>

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
    //  label: "label1",
    //  referenceVolumeUID: "referenceVolumeName", // volume viewport
    //  referenceImageId: "referenceImageId", // stack viewport
    // 	activeSegmentIndex: 1,
    //  segmentsLocked: Set(),
    //  cacheStats: {} // storing labelmap specific statistics
    // }
    // {
    // 	volumeUID: "labelmapUID2",
    //  label: "label1",
    //  referenceVolumeUID: "referenceVolumeName", // volume viewport
    //  referenceImageId: "referenceImageId", // stack viewport
    // 	activeSegmentIndex: 1,
    //  segmentsLocked: Set(),
    //  cacheStats: {} // storing labelmap specific statistics
    // }
  ],
  volumeViewports: {
    // viewportUID: {
    //   activeLabelmapUID: 1,
    //   labelmaps: [
    //     {
    //       volumeUID: 'labelmapUID1',
    //       colorLUTIndex: 0,
    //       visibility: true,
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
    //       },
    //     },
    //     {
    //       volumeUID: 'labelmapUID2',
    //       colorLUTIndex: 0,
    //       visibility: true,
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
    //        },
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
 * @param element HTML element
 * @returns ViewportLabelmapsState
 */
function getGlobalStateForLabelmapUID(
  labelmapUID: string
): LabelmapGlobalState {
  return state.labelmaps.find(
    (labelmapState) => labelmapState.volumeUID === labelmapUID
  )
}

function _initDefaultColorLUT() {
  if (state.colorLutTables.length === 0) {
    setColorLUT(0)
  }
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
    label: labelmapUID,
    referenceVolumeUID: null,
    cachedStats: {},
    referenceImageId: null,
    activeSegmentIndex: 1,
    segmentsLocked: new Set(),
  }
): void {
  // Creating the default color LUT if not created yet
  _initDefaultColorLUT()

  // Don't allow overwriting existing labelmapState with the same labelmapUID
  const existingState = state.labelmaps.find(
    (labelmapState) => labelmapState.volumeUID === labelmapUID
  )

  if (existingState) {
    if (newState.volumeUID && newState.volumeUID !== labelmapUID) {
      throw new Error(
        `Labelmap state with volumeUID ${newState.volumeUID} already exists`
      )
    }
  }

  // merge the new state with the existing state
  const updatedState = {
    ...existingState,
    ...newState,
  }

  // Is there any existing state?
  if (!existingState) {
    state.labelmaps.push({
      volumeUID: labelmapUID,
      label: updatedState.label,
      referenceVolumeUID: updatedState.referenceVolumeUID,
      cachedStats: updatedState.cachedStats,
      referenceImageId: updatedState.referenceImageId,
      activeSegmentIndex: updatedState.activeSegmentIndex,
      segmentsLocked: updatedState.segmentsLocked,
    })
  } else {
    // If there is an existing state, replace it
    const index = state.labelmaps.findIndex(
      (labelmapState) => labelmapState.volumeUID === labelmapUID
    )
    state.labelmaps[index] = updatedState
  }

  triggerLabelmapStateUpdated(labelmapUID)
}

/**
 * Sets the labelmap viewport-specific state
 *
 * @param viewportUID labelmapUID
 * @param labelmapUID labelmapUID
 * @param viewportLabelmapState viewport-specific state of the labelmap
 * @param overwrite force overwriting already existing labelmapState
 */
function setLabelmapViewportSpecificState(
  viewportUID: string,
  labelmapUID: string,
  labelmapIndex = 0,
  viewportLabelmapState?: ViewportLabelmapState
): void {
  let labelmapState = viewportLabelmapState
  if (!labelmapState) {
    labelmapState = {
      volumeUID: labelmapUID,
      segmentsHidden: new Set(),
      visibility: true,
      colorLUTIndex: 0,
      cfun: vtkColorTransferFunction.newInstance(),
      ofun: vtkPiecewiseFunction.newInstance(),
      labelmapConfig: {},
    }
  }
  // Todo: check if there is a labelmapGlobalState
  const viewportLabelmapsState = _getLabelmapsStateForViewportUID(viewportUID)

  if (!viewportLabelmapsState) {
    state.volumeViewports[viewportUID] = {
      activeLabelmapIndex: 0,
      labelmaps: [],
    }
  }

  state.volumeViewports[viewportUID].labelmaps[labelmapIndex] = {
    volumeUID: labelmapUID,
    segmentsHidden: labelmapState.segmentsHidden,
    visibility: labelmapState.visibility,
    colorLUTIndex: labelmapState.colorLUTIndex,
    cfun: labelmapState.cfun,
    ofun: labelmapState.ofun,
    labelmapConfig: labelmapState.labelmapConfig,
  }
}

/**
 * Returns the viewport specific labelmapsState for HTML element
 * @param element HTML element
 * @returns ViewportLabelmapsState
 */
function getLabelmapsStateForElement(
  element: HTMLElement
): ViewportLabelmapsState {
  const enabledElement = getEnabledElement(element)

  if (!enabledElement) {
    return
  }

  const { viewport, viewportUID } = enabledElement

  // Todo: stack Viewport
  if (!(viewport instanceof VolumeViewport)) {
    throw new Error('Stack Viewport segmentation not supported yet')
  }

  return _getLabelmapsStateForViewportUID(viewportUID)
}

function removeLabelmapFromGlobalState(labelmapUID: string): void {
  const labelmapGlobalState = getGlobalStateForLabelmapUID(labelmapUID)

  if (labelmapGlobalState) {
    const labelmapGlobalIndex = state.labelmaps.findIndex(
      (labelmap) => labelmap.volumeUID === labelmapUID
    )

    state.labelmaps.splice(labelmapGlobalIndex, 1)
  }
}

// function removeLabelmapFromContainingViewports(labelmapUID: string): void {
//   // get viewportUIDs in the state
//   const viewportUIDs = Object.keys(state.volumeViewports)

//   // remove the labelmap from all viewports
//   viewportUIDs.forEach((viewportUID) => {
//     const viewportLabelmapsState = state.volumeViewports[viewportUID]

//     if (viewportLabelmapsState) {
//       const labelmapIndex = viewportLabelmapsState.labelmaps.findIndex(
//         (labelmap) => labelmap.volumeUID === labelmapUID
//       )

//       if (labelmapIndex !== -1) {
//         viewportLabelmapsState.labelmaps.splice(labelmapIndex, 1)
//       }
//     }
//   })
// }

/**
 * Returns the viewport specific labelmapState for a viewportUID and the provided
 * labelmapIndex, or if index not provided, for the activeLabelmap
 * @param viewportUID viewportUID
 * @param [labelmapIndexOrUID] labelmapIndex
 * @returns ViewportLabelmapState
 */
function getLabelmapStateForElement(
  element: HTMLElement,
  labelmapIndex?: number
): ViewportLabelmapState {
  const { viewportUID } = getEnabledElement(element)
  return _getLabelmapStateForViewportUID(viewportUID, labelmapIndex)
}

/**
 * Returns the viewport specific labelmapS State for HTML element
 * @param element HTML element
 * @returns ViewportLabelmapsState
 */
function getActiveLabelmapState(
  element: HTMLElement
): ViewportLabelmapState | undefined {
  const activeLabelmapIndex = getActiveLabelmapIndex(element)
  const labelmapsState = getLabelmapsStateForElement(element)

  if (!labelmapsState) {
    return
  }

  return labelmapsState.labelmaps[activeLabelmapIndex]
}

/**
 * Returns the viewport specific labelmapsState for a viewportUID
 * @param viewportUID viewportUID
 * @returns ViewportLabelmapsState
 */
function _getLabelmapsStateForViewportUID(
  viewportUID: string
): ViewportLabelmapsState {
  return state.volumeViewports[viewportUID]
}

/**
 * Returns the viewport specific labelmapsState for a viewportUID
 * @param viewportUID viewportUID
 * @returns ViewportLabelmapsState
 */
function _getLabelmapStateForViewportUID(
  viewportUID: string,
  labelmapIndex?: number
): ViewportLabelmapState {
  const viewportLabelmapsState = state.volumeViewports[viewportUID]

  const index =
    labelmapIndex === undefined
      ? viewportLabelmapsState.activeLabelmapIndex
      : labelmapIndex

  return viewportLabelmapsState.labelmaps[index]
}

export default state
export {
  // get
  getLabelmapsStateForElement,
  getLabelmapStateForElement,
  getActiveLabelmapState,
  getGlobalStateForLabelmapUID,
  // set
  setLabelmapGlobalState,
  setLabelmapViewportSpecificState,
  // remove
  removeLabelmapFromGlobalState,
}
