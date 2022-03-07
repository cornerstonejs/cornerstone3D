import { state } from '../store'
import { getEnabledElement } from '@precisionmetrics/cornerstone-render'

/**
 * Returns the SVG drawing helper for the given HTML element.
 * @param element - The HTML element to get the SVG drawing helper for.
 * @private
 */
function getSvgDrawingHelper(element: HTMLElement) {
  const enabledElement = getEnabledElement(element)
  const { viewportUID, renderingEngineUID } = enabledElement
  const canvasHash = `${viewportUID}:${renderingEngineUID}`
  const svgLayerElement = _getSvgLayer(element)

  // Reset touched
  Object.keys(state.svgNodeCache[canvasHash]).forEach((cacheKey) => {
    state.svgNodeCache[canvasHash][cacheKey].touched = false
  })

  return {
    // Todo: not sure if we need enabledElement and _element anymore here
    enabledElement: enabledElement,
    _element: element,
    _svgLayerElement: svgLayerElement,
    _svgNodeCacheForCanvas: state.svgNodeCache,
    _getSvgNode: getSvgNode.bind(this, canvasHash),
    _appendNode: appendNode.bind(this, svgLayerElement, canvasHash),
    _setNodeTouched: setNodeTouched.bind(this, canvasHash),
    _clearUntouched: clearUntouched.bind(this, svgLayerElement, canvasHash),
    // _drawnAnnotations: drawnAnnotations,
  }
}

/**
 *
 * @param canvasElement
 * @private
 */
function _getSvgLayer(element) {
  const internalDivElement = element.firstChild
  const svgLayer = internalDivElement.querySelector('.svg-layer')

  return svgLayer
}

function getSvgNode(canvasHash, cacheKey) {
  // If state has been reset
  if (!state.svgNodeCache[canvasHash]) {
    return
  }

  if (state.svgNodeCache[canvasHash][cacheKey]) {
    return state.svgNodeCache[canvasHash][cacheKey].domRef
  }
}

function appendNode(svgLayerElement, canvasHash, svgNode, cacheKey) {
  // If state has been reset
  if (!state.svgNodeCache[canvasHash]) {
    return null
  }

  state.svgNodeCache[canvasHash][cacheKey] = {
    touched: true,
    domRef: svgNode,
  }

  svgLayerElement.appendChild(svgNode)
}

function setNodeTouched(canvasHash, cacheKey) {
  // If state has been reset
  if (!state.svgNodeCache[canvasHash]) {
    return
  }

  if (state.svgNodeCache[canvasHash][cacheKey]) {
    state.svgNodeCache[canvasHash][cacheKey].touched = true
  }
}

function clearUntouched(svgLayerElement, canvasHash) {
  // If state has been reset
  if (!state.svgNodeCache[canvasHash]) {
    return
  }

  Object.keys(state.svgNodeCache[canvasHash]).forEach((cacheKey) => {
    const cacheEntry = state.svgNodeCache[canvasHash][cacheKey]

    if (!cacheEntry.touched && cacheEntry.domRef) {
      svgLayerElement.removeChild(cacheEntry.domRef)
      delete state.svgNodeCache[canvasHash][cacheKey]
    }
  })
}

export default getSvgDrawingHelper
