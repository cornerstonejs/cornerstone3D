import { getEnabledElement, Types } from '@cornerstonejs/core'
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

import filterToolsWithAnnotationsForElement from './filterToolsWithAnnotationsForElement'
import { state } from './state'
import getToolsWithModesForElement from '../utilities/getToolsWithModesForElement'
import { ToolModes } from '../enums'
import { removeAnnotation } from '../stateManagement'
import getSynchronizers from './SynchronizerManager/getSynchronizers'
import getToolGroup from './ToolGroupManager/getToolGroup'
import { annotationRenderingEngine } from '../utilities/triggerAnnotationRender'

const VIEWPORT_ELEMENT = 'viewport-element'

function removeEnabledElement(
  elementDisabledEvt: Types.EventTypes.ElementDisabledEvent
): void {
  // Is DOM element
  const { element, viewportId } = elementDisabledEvt.detail

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
  annotationRenderingEngine.removeViewportElement(viewportId)

  // Listeners
  mouseEventListeners.disable(element)
  wheelEventListener.disable(element)
  keyEventListener.disable(element)
  // labelmap

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
  _removeViewportFromToolGroup(element)

  // _removeAllToolsForElement(canvas)
  _removeEnabledElement(element)
}

const _removeViewportFromSynchronizers = (element: HTMLElement) => {
  const enabledElement = getEnabledElement(element)

  const synchronizers = getSynchronizers(
    enabledElement.renderingEngineUID,
    enabledElement.viewportId
  )
  synchronizers.forEach((sync) => {
    sync.remove(enabledElement)
  })
}

const _removeViewportFromToolGroup = (element: HTMLElement) => {
  const { renderingEngineUID, viewportId } = getEnabledElement(element)

  const toolGroup = getToolGroup(viewportId, renderingEngineUID)

  if (toolGroup) {
    toolGroup.removeViewports(renderingEngineUID, viewportId)
  }
}

const _removeAllToolsForElement = function (element) {
  const tools = getToolsWithModesForElement(element, [
    ToolModes.Active,
    ToolModes.Passive,
  ])

  const toolsWithData = filterToolsWithAnnotationsForElement(element, tools)
  toolsWithData.forEach(({ annotations }) => {
    annotations.forEach((annotation) => {
      removeAnnotation(element, annotation.annotationUID)
    })
  })
}

function _resetSvgNodeCache(element: HTMLElement) {
  const { viewportUid: viewportId, renderingEngineUid: renderingEngineUID } =
    element.dataset
  const elementHash = `${viewportId}:${renderingEngineUID}`

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
