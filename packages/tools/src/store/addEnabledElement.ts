import { Types } from '@cornerstonejs/core';
import {
  mouseEventListeners,
  wheelEventListener,
  touchEventListeners,
  keyEventListener,
} from '../eventListeners';
import {
  imageRenderedEventDispatcher,
  cameraModifiedEventDispatcher,
  mouseToolEventDispatcher,
  touchToolEventDispatcher,
  keyboardToolEventDispatcher,
  imageSpacingCalibratedEventDispatcher,
} from '../eventDispatchers';
import { state } from './state';

import { annotationRenderingEngine } from '../utilities/triggerAnnotationRender';

/**
 * When an element is "enabled", add event listeners and dispatchers to it
 * so we can use interactions to affect tool behaviors
 *
 * @param evt - The ELEMENT_ENABLED event
 */
export default function addEnabledElement(
  evt: Types.EventTypes.ElementEnabledEvent
): void {
  const { element, viewportId } = evt.detail;
  const svgLayer = _createSvgAnnotationLayer();

  // Reset/Create svgNodeCache for element
  _setSvgNodeCache(element);
  _appendChild(svgLayer, element);

  // Add this element to the annotation rendering engine
  annotationRenderingEngine.addViewportElement(viewportId, element);

  // Listeners
  mouseEventListeners.enable(element);
  wheelEventListener.enable(element);
  touchEventListeners.enable(element);
  keyEventListener.enable(element);

  // Dispatchers: renderer
  imageRenderedEventDispatcher.enable(element);
  cameraModifiedEventDispatcher.enable(element);
  imageSpacingCalibratedEventDispatcher.enable(element);
  // Dispatchers: interaction
  mouseToolEventDispatcher.enable(element);
  keyboardToolEventDispatcher.enable(element);
  touchToolEventDispatcher.enable(element);

  // labelmap
  // State
  state.enabledElements.push(element);
}

/**
 *
 */
function _createSvgAnnotationLayer(): SVGElement {
  const svgns = 'http://www.w3.org/2000/svg';
  const svgLayer = document.createElementNS(svgns, 'svg');

  svgLayer.classList.add('svg-layer');
  svgLayer.setAttribute('id', 'svg-layer');
  svgLayer.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svgLayer.style.width = '100%';
  svgLayer.style.height = '100%';
  svgLayer.style.pointerEvents = 'none';
  svgLayer.style.position = 'absolute';
  // TODO: we should test this on high-res monitors
  //svgLayer.style.textRendering = 'optimizeSpeed'

  // Single dropshadow config for now
  const defs = document.createElementNS(svgns, 'defs');
  const filter = document.createElementNS(svgns, 'filter');
  const feOffset = document.createElementNS(svgns, 'feOffset');
  const feColorMatrix = document.createElementNS(svgns, 'feColorMatrix');
  const feBlend = document.createElementNS(svgns, 'feBlend');

  //
  filter.setAttribute('id', 'shadow');
  filter.setAttribute('filterUnits', 'userSpaceOnUse');

  //
  feOffset.setAttribute('result', 'offOut');
  feOffset.setAttribute('in', 'SourceGraphic');
  feOffset.setAttribute('dx', '0.5');
  feOffset.setAttribute('dy', '0.5');

  //
  feColorMatrix.setAttribute('result', 'matrixOut');
  feColorMatrix.setAttribute('in', 'offOut');
  feColorMatrix.setAttribute('in2', 'matrix');
  feColorMatrix.setAttribute(
    'values',
    '0.2 0 0 0 0 0 0.2 0 0 0 0 0 0.2 0 0 0 0 0 1 0'
  );

  //
  feBlend.setAttribute('in', 'SourceGraphic');
  feBlend.setAttribute('in2', 'matrixOut');
  feBlend.setAttribute('mode', 'normal');

  filter.appendChild(feOffset);
  filter.appendChild(feColorMatrix);
  filter.appendChild(feBlend);
  defs.appendChild(filter);
  svgLayer.appendChild(defs);

  return svgLayer;
}

function _setSvgNodeCache(element) {
  const { viewportUid: viewportId, renderingEngineUid: renderingEngineId } =
    element.dataset;
  const elementHash = `${viewportId}:${renderingEngineId}`;

  // Create or reset
  // TODO: If... Reset, we should blow out any nodes in DOM
  state.svgNodeCache[elementHash] = {};
}

/**
 *
 * @param newNode
 * @param referenceNode
 */
function _appendChild(
  newNode: SVGElement,
  referenceNode: HTMLDivElement
): void {
  referenceNode.querySelector('div.viewport-element').appendChild(newNode);
}
