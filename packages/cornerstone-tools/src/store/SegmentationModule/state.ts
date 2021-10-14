import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'
import { ISegmentationConfig } from './segmentationConfig'
import { getEnabledElement } from '@ohif/cornerstone-render'
import { getActiveLabelmapIndex } from './activeLabelmapController'
import { setColorLUT } from './colorLUT'

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

export type ViewportLabelmapState = {
  volumeUID: string
  segmentsHidden: Set<number>
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
    referenceVolumeUID: null,
    referenceImageId: null,
    activeSegmentIndex: 1,
    segmentsLocked: new Set(),
  }
): void {
  // Creating the default color LUT if not created yet
  _initDefaultColorLUT()

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
      colorLUTIndex: 0,
      cfun: vtkColorTransferFunction.newInstance(),
      ofun: vtkPiecewiseFunction.newInstance(),
      labelmapConfig: {},
    }
  }
  // Todo: check if there is a labelmapGlobalState
  const viewportLabelmapsState = _getLabelmapsStateForViewportUID(viewportUID)
  const { segmentsHidden, colorLUTIndex, cfun, ofun, labelmapConfig } =
    labelmapState

  viewportLabelmapsState.labelmaps[labelmapIndex] = {
    volumeUID: labelmapUID,
    segmentsHidden,
    colorLUTIndex,
    cfun,
    ofun,
    labelmapConfig,
  }
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

  return _getLabelmapsStateForViewportUID(viewportUID)
}

/**
 * Returns the viewport specific labelmapState for a viewportUID and the provided
 * labelmapIndex, or if index not provided, for the activeLabelmap
 * @param viewportUID viewportUID
 * @param [labelmapIndexOrUID] labelmapIndex
 * @returns ViewportLabelmapState
 */
function getLabelmapStateForElement(
  element: HTMLCanvasElement,
  labelmapIndex?: number
): ViewportLabelmapState {
  const { viewportUID } = getEnabledElement(element)
  return _getLabelmapStateForViewportUID(viewportUID, labelmapIndex)
}

/**
 * Returns the viewport specific labelmapS State for HTML element
 * @param canvas HTML Canvas
 * @returns ViewportLabelmapsState
 */
function getActiveLabelmapState(
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
}
