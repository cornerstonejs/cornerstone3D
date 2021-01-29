import { state } from './../store'
import { getEnabledElement } from '@vtk-viewport'

/**
 *
 * @param canvasElement
 * @private
 */
function getSvgDrawingHelper(canvasElement: HTMLCanvasElement) {
  const enabledElement = getEnabledElement(canvasElement)
  const { viewportUID, sceneUID, renderingEngineUID } = enabledElement
  const canvasHash = `${viewportUID}:${sceneUID}:${renderingEngineUID}`
  const svgLayerElement = _getSvgLayer(canvasElement)

  // Reset touched
  Object.keys(state.svgNodeCache[canvasHash]).forEach((cacheKey) => {
    state.svgNodeCache[canvasHash][cacheKey].touched = false
  })

  return {
    enabledElement: enabledElement,
    _canvasElement: canvasElement,
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
function _getSvgLayer(canvasElement) {
  const parentElement = canvasElement.parentNode
  const svgLayer = parentElement.querySelector('.svg-layer')

  return svgLayer
}

function getSvgNode(canvasHash, cacheKey) {
  if (state.svgNodeCache[canvasHash][cacheKey]) {
    return state.svgNodeCache[canvasHash][cacheKey].domRef
  }
}

function appendNode(svgLayerElement, canvasHash, svgNode, cacheKey) {
  state.svgNodeCache[canvasHash][cacheKey] = {
    touched: true,
    domRef: svgNode,
  }

  svgLayerElement.appendChild(svgNode)
}

function setNodeTouched(canvasHash, cacheKey) {
  if (state.svgNodeCache[canvasHash][cacheKey]) {
    state.svgNodeCache[canvasHash][cacheKey].touched = true
  }
}

function clearUntouched(svgLayerElement, canvasHash) {
  Object.keys(state.svgNodeCache[canvasHash]).forEach((cacheKey) => {
    const cacheEntry = state.svgNodeCache[canvasHash][cacheKey]

    if (!cacheEntry.touched && cacheEntry.domRef) {
      // console.log(`Removing: ${svgNodeHash}`)
      svgLayerElement.removeChild(cacheEntry.domRef)
      delete state.svgNodeCache[canvasHash][cacheKey]
    }
  })
}

export default getSvgDrawingHelper
