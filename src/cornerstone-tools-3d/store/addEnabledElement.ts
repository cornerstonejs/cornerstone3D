import { mouseEventListeners, wheelEventListener } from './../eventListeners'
import {
  imageRenderedEventDispatcher,
  cameraModifiedEventDispatcher,
  mouseToolEventDispatcher,
} from './../eventDispatchers'
import { state } from './index'

/**
 * When an element is "enabled", add event listeners and dispatchers to it
 * so we can use interactions to affect tool behaviors
 *
 * @param evt The ELEMENT_ENABLED event
 */
export default function addEnabledElement(evt: CustomEvent): void {
  const canvas = <HTMLElement>evt.detail.canvas
  const svgLayer = _createSvgAnnotationLayer()

  _insertAfter(svgLayer, canvas)

  // Listeners
  mouseEventListeners.enable(canvas)
  wheelEventListener.enable(canvas)
  // Dispatchers: renderer
  imageRenderedEventDispatcher.enable(canvas);
  cameraModifiedEventDispatcher.enable(canvas);
  // Dispatchers: interaction
  mouseToolEventDispatcher.enable(canvas)
  // touchToolEventDispatcher.enable(enabledElement);

  // State
  state.enabledElements.push(canvas)
}

/**
 *
 */
function _createSvgAnnotationLayer(): SVGElement {
  const svgns = 'http://www.w3.org/2000/svg'
  const svgLayer = document.createElementNS(svgns, 'svg')

  svgLayer.classList.add('svg-layer')
  svgLayer.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svgLayer.style.width = '100%'
  svgLayer.style.height = '100%'
  svgLayer.style.pointerEvents = 'none'
  svgLayer.style.position = 'absolute'

  return svgLayer
}

/**
 *
 * @param newNode
 * @param referenceNode
 */
function _insertAfter(newNode: SVGElement, referenceNode: HTMLElement): void {
  referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling)
}
