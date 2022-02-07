import { getEnabledElement } from '@ohif/cornerstone-render'
import {
  mouseEventListeners,
  wheelEventListener,
  keyEventListener,
  labelmapStateEventListener,
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
import { IEnabledElement } from '@ohif/cornerstone-render/src/types'

const VIEWPORT_ELEMENT = 'viewport-element'

function removeEnabledElement(elementDisabledEvt: CustomEvent): void {
  // Is DOM element
  const { element, viewportUID } = elementDisabledEvt.detail

  _resetSvgNodeCache(element)

  // Todo: shouldn't this also remove the canvas?
  const viewportNode = element
  const svgLayer = viewportNode.querySelector('svg')
  const internalViewportNode = element.querySelector(`div.${VIEWPORT_ELEMENT}`)
  // element.removeChild(internalViewportNode)
  if (svgLayer) {
    internalViewportNode.removeChild(svgLayer)
  }

  // Remove this element from the annotation rendering engine
  annotationRenderingEngine.removeViewportElement(viewportUID)

  // Listeners
  mouseEventListeners.disable(element)
  wheelEventListener.disable(element)
  keyEventListener.disable(element)
  // labelmap
  labelmapStateEventListener.disable(element)

  // Dispatchers: renderer
  imageRenderedEventDispatcher.disable(element)
  cameraModifiedEventDispatcher.disable(element)
  imageSpacingCalibratedEventDispatcher.disable(element)
  // Dispatchers: interaction
  mouseToolEventDispatcher.disable(element)
  keyboardToolEventDispatcher.disable(element)
  // touchToolEventDispatcher.disable(canvas);

  // State
  // @TODO: We used to "disable" the tool before removal. Should we preserve the hook that would call on tools?
  _removeViewportFromSynchronizers(element)
  _removeViewportFromToolGroups(element)

  // _removeAllToolsForElement(canvas)
  _removeEnabledElement(element)
}

const _removeViewportFromSynchronizers = (element: HTMLElement) => {
  const enabledElement = getEnabledElement(element)

  const synchronizers = getSynchronizers(enabledElement)
  synchronizers.forEach((sync) => {
    sync.remove(enabledElement)
  })
}

const _removeViewportFromToolGroups = (element: HTMLElement) => {
  const { renderingEngineUID, sceneUID, viewportUID } =
    getEnabledElement(element)

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

function _resetSvgNodeCache(element: HTMLElement) {
  const {
    viewportUid: viewportUID,
    sceneUid: sceneUID,
    renderingEngineUid: renderingEngineUID,
  } = element.dataset
  const elementHash = `${viewportUID}:${sceneUID}:${renderingEngineUID}`

  delete state.svgNodeCache[elementHash]
}

/**
 * @private
 * @param enabledElement
 */
const _removeEnabledElement = function (element: HTMLElement) {
  const foundElementIndex = state.enabledElements.findIndex(
    (el) => el === element
  )

  if (foundElementIndex > -1) {
    state.enabledElements.splice(foundElementIndex, 1)
  }
}

export default removeEnabledElement
