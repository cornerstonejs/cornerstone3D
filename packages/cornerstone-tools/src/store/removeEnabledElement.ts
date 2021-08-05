import { getEnabledElement } from '@ohif/cornerstone-render'
import {
  mouseEventListeners,
  wheelEventListener,
  keyEventListener,
} from '../eventListeners'
import {
  imageRenderedEventDispatcher,
  cameraModifiedEventDispatcher,
  mouseToolEventDispatcher,
  keyboardToolEventDispatcher,
  imageSpacingCalibratedEventDispatcher,
  //   touchToolEventDispatcher,
} from '../eventDispatchers'
// ~~

import getToolsWithDataForElement from './getToolsWithDataForElement'
import { state } from './state'
import getToolsWithModesForElement from '../util/getToolsWithModesForElement'
import { ToolModes } from '../enums'
import { removeToolState } from '../stateManagement'
import getSynchronizers from './SynchronizerManager/getSynchronizers'
import getToolGroups from './ToolGroupManager/getToolGroups'
import { annotationRenderingEngine } from '../util/triggerAnnotationRender'

function removeEnabledElement(elementDisabledEvt: CustomEvent): void {
  // Is DOM element
  const { canvas } = elementDisabledEvt.detail

  _resetSvgNodeCacheForCanvas(canvas)
  // Remove svg layer
  const viewportNode = canvas.parentNode
  const svgLayer = viewportNode.querySelector('svg')
  if (svgLayer) {
    viewportNode.removeChild(svgLayer)
  }

  // Remove this element from the annotation rendering engine
  annotationRenderingEngine.removeViewportElement(canvas)

  // Listeners
  mouseEventListeners.disable(canvas)
  wheelEventListener.disable(canvas)
  keyEventListener.disable(canvas)
  // Dispatchers: renderer
  imageRenderedEventDispatcher.disable(canvas)
  cameraModifiedEventDispatcher.disable(canvas)
  imageSpacingCalibratedEventDispatcher.disable(canvas)
  // Dispatchers: interaction
  mouseToolEventDispatcher.disable(canvas)
  keyboardToolEventDispatcher.disable(canvas)
  // touchToolEventDispatcher.disable(canvas);

  // State
  // @TODO: We used to "disable" the tool before removal. Should we preserve the hook that would call on tools?
  _removeViewportFromSynchronizers(canvas)
  _removeViewportFromToolGroups(canvas)

  // _removeAllToolsForElement(canvas)
  _removeEnabledElement(canvas)
}

const _removeViewportFromSynchronizers = (canvas) => {
  const enabledElement = getEnabledElement(canvas)
  const synchronizers = getSynchronizers(enabledElement)
  synchronizers.forEach((sync) => {
    sync.remove(enabledElement)
  })
}

const _removeViewportFromToolGroups = (canvas) => {
  const { renderingEngineUID, sceneUID, viewportUID } =
    getEnabledElement(canvas)
  const toolGroups = getToolGroups(renderingEngineUID, sceneUID, viewportUID)
  toolGroups.forEach((toolGroup) => {
    toolGroup.removeViewports(renderingEngineUID, sceneUID, viewportUID)
  })
}

const _removeAllToolsForElement = function (element) {
  const tools = getToolsWithModesForElement(element, [
    ToolModes.Active,
    ToolModes.Passive,
  ])

  const toolsWithData = getToolsWithDataForElement(element, tools)
  toolsWithData.forEach(({ toolState }) => {
    toolState.forEach((state) => {
      removeToolState(element, state)
    })
  })
}

function _resetSvgNodeCacheForCanvas(canvas) {
  const {
    viewportUid: viewportUID,
    sceneUid: sceneUID,
    renderingEngineUid: renderingEngineUID,
  } = canvas.dataset
  const canvasHash = `${viewportUID}:${sceneUID}:${renderingEngineUID}`

  delete state.svgNodeCache[canvasHash]
}

/**
 * @private
 * @param enabledElement
 */
const _removeEnabledElement = function (enabledElement: HTMLElement) {
  const foundElementIndex = state.enabledElements.findIndex(
    (element) => element === enabledElement
  )

  if (foundElementIndex > -1) {
    state.enabledElements.splice(foundElementIndex, 1)
  }
}

export default removeEnabledElement
