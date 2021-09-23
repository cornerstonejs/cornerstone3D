import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction'
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction'

import { _cloneDeep } from 'lodash.clonedeep'
import {
  getEnabledElement,
  createAndCacheDerivedVolume,
  createAndCacheLocalVolume,
} from '@ohif/cornerstone-render'

import state from './state'
import { Point3 } from '../../types'
import setLabelmapForElement from './setLabelmapForElement'

type LabelmapOptions = {
  volumeUID?: string
  customOptions?: {
    scalarData?: Float32Array | Uint8Array
    targetBuffer?: {
      type: 'Float32Array' | 'Uint8Array'
    }
    metadata?: any
    dimensions?: Point3
    spacing?: Point3
    origin?: Point3
    direction?: Float32Array
  }
}

function getNextLabelmapIndex(canvas) {
  const enabledElement = getEnabledElement(canvas)

  if (!enabledElement) {
    return
  }

  const { viewportUID } = enabledElement

  // VolumeViewport Implementation
  const viewportSegState = state.volumeViewports[viewportUID]

  if (!viewportSegState) {
    return 0
  }

  const numLabelmaps = viewportSegState.labelmaps.filter(
    (labelmapUID) => !!labelmapUID
  ).length

  return numLabelmaps + 1
}

/**
 * addNewLabelmap - Adds a `Labelmap3D` object to the `BrushStackState` object.
 *
 * @param  {BrushStackState} brushStackState The labelmap state for a particular stack.
 * @param  {number} labelmapIndex   The labelmapIndex to set.
 * @param  {object} options  Options for creating the labelmap
 * @returns {null}
 */
async function addNewLabelmap({
  canvas,
  labelmapIndex,
  options,
}: {
  canvas: HTMLCanvasElement
  labelmapIndex: number
  options: LabelmapOptions
}): Promise<string> {
  const enabledElement = getEnabledElement(canvas)

  if (!enabledElement) {
    throw new Error('element disabled')
  }

  const { viewport, viewportUID, scene } = enabledElement
  const { volumeUID: labelmapUID, customOptions } = options

  if (!scene) {
    throw new Error('Segmentation not ready for stackViewport')
  }

  let labelmap
  if (customOptions) {
    // create a new labelmap with its own properties
    // This allows creation of a higher resolution labelmap vs reference volume
    const properties = _cloneDeep(options)
    labelmap = await createAndCacheLocalVolume(properties, labelmapUID)
  } else {
    // create a labelmap from a reference volume
    const { uid: volumeUID } = viewport.getDefaultActor()
    labelmap = await createAndCacheDerivedVolume(volumeUID, {
      uid: labelmapUID,
    })
  }

  // VolumeViewport Implementation
  let viewportSegState = state.volumeViewports[viewportUID]

  // If first time with this state
  if (!viewportSegState) {
    // If no state is assigned for the viewport for segmentation: create an empty
    // segState for the viewport and assign the requested labelmapIndex as the active one.
    viewportSegState = {
      activeLabelmapIndex: labelmapIndex,
      labelmaps: [],
    }
    state.volumeViewports[viewportUID] = viewportSegState
  }

  // Updating the active labelmapIndex
  state.volumeViewports[viewportUID].activeLabelmapIndex = labelmapIndex

  // Adding the new labelmap state
  let labelmapState = viewportSegState.labelmaps[labelmapIndex]
  if (!labelmapState) {
    labelmapState = {
      volumeUID: labelmapUID,
      activeSegmentIndex: 0,
      segmentsHidden: [],
      cfun: vtkColorTransferFunction.newInstance(),
      ofun: vtkPiecewiseFunction.newInstance(),
    }
    viewportSegState.labelmaps[labelmapIndex] = labelmapState
  } else {
    throw new Error(
      `You are overriding the labelmap at labelmapIndex${labelmapIndex}`
    )
  }

  setLabelmapForElement({
    canvas: viewport.canvas,
    labelmap: labelmap,
    labelmapIndex,
    immediateRender: true,
  })

  return labelmapUID
}

export { addNewLabelmap, getNextLabelmapIndex }
