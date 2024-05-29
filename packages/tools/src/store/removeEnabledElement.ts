import { getEnabledElement, Types } from '@cornerstonejs/core';
import {
  mouseEventListeners,
  wheelEventListener,
  touchEventListeners,
  keyEventListener,
  imageChangeEventListener,
} from '../eventListeners/index.js';
import {
  imageRenderedEventDispatcher,
  cameraModifiedEventDispatcher,
  mouseToolEventDispatcher,
  keyboardToolEventDispatcher,
  imageSpacingCalibratedEventDispatcher,
  touchToolEventDispatcher,
  cameraResetEventDispatcher,
} from '../eventDispatchers/index.js';
// ~~

import filterToolsWithAnnotationsForElement from './filterToolsWithAnnotationsForElement.js';
import { state } from './state.js';
import getToolsWithModesForElement from '../utilities/getToolsWithModesForElement.js';
import { ToolModes } from '../enums/index.js';
import { removeAnnotation } from '../stateManagement/index.js';
import getSynchronizersForViewport from './SynchronizerManager/getSynchronizersForViewport.js';
import getToolGroupForViewport from './ToolGroupManager/getToolGroupForViewport.js';
import { annotationRenderingEngine } from '../utilities/triggerAnnotationRender.js';

const VIEWPORT_ELEMENT = 'viewport-element';

function removeEnabledElement(
  elementDisabledEvt: Types.EventTypes.ElementDisabledEvent
): void {
  // Is DOM element
  const { element, viewportId } = elementDisabledEvt.detail;

  _resetSvgNodeCache(element);
  _removeSvgNode(element);

  // Remove this element from the annotation rendering engine
  annotationRenderingEngine.removeViewportElement(viewportId, element);

  // Listeners
  mouseEventListeners.disable(element);
  wheelEventListener.disable(element);
  touchEventListeners.disable(element);
  keyEventListener.disable(element);

  // labelmap
  imageChangeEventListener.disable(element);

  // Dispatchers: renderer
  imageRenderedEventDispatcher.disable(element);
  cameraModifiedEventDispatcher.disable(element);
  imageSpacingCalibratedEventDispatcher.disable(element);
  cameraResetEventDispatcher.disable(element);

  // Dispatchers: interaction
  mouseToolEventDispatcher.disable(element);
  keyboardToolEventDispatcher.disable(element);
  touchToolEventDispatcher.disable(element);

  // State
  // @TODO: We used to "disable" the tool before removal. Should we preserve the hook that would call on tools?
  _removeViewportFromSynchronizers(element);
  _removeViewportFromToolGroup(element);

  // _removeAllToolsForElement(canvas)
  _removeEnabledElement(element);
}

const _removeViewportFromSynchronizers = (element: HTMLDivElement) => {
  const enabledElement = getEnabledElement(element);

  const synchronizers = getSynchronizersForViewport(
    enabledElement.viewportId,
    enabledElement.renderingEngineId
  );
  synchronizers.forEach((sync) => {
    sync.remove(enabledElement);
  });
};

const _removeViewportFromToolGroup = (element: HTMLDivElement) => {
  const { renderingEngineId, viewportId } = getEnabledElement(element);

  const toolGroup = getToolGroupForViewport(viewportId, renderingEngineId);

  if (toolGroup) {
    toolGroup.removeViewports(renderingEngineId, viewportId);
  }
};

const _removeAllToolsForElement = function (element) {
  const tools = getToolsWithModesForElement(element, [
    ToolModes.Active,
    ToolModes.Passive,
  ]);

  const toolsWithData = filterToolsWithAnnotationsForElement(element, tools);
  toolsWithData.forEach(({ annotations }) => {
    annotations.forEach((annotation) => {
      removeAnnotation(annotation.annotationUID);
    });
  });
};

function _resetSvgNodeCache(element: HTMLDivElement) {
  const { viewportUid: viewportId, renderingEngineUid: renderingEngineId } =
    element.dataset;
  const elementHash = `${viewportId}:${renderingEngineId}`;

  delete state.svgNodeCache[elementHash];
}

function _removeSvgNode(element: HTMLDivElement) {
  const internalViewportNode = element.querySelector(`div.${VIEWPORT_ELEMENT}`);
  const svgLayer = internalViewportNode.querySelector('svg');
  if (svgLayer) {
    internalViewportNode.removeChild(svgLayer);
  }
}

/**
 * @private
 * @param enabledElement
 */
const _removeEnabledElement = function (element: HTMLDivElement) {
  const foundElementIndex = state.enabledElements.findIndex(
    (el) => el === element
  );

  if (foundElementIndex > -1) {
    state.enabledElements.splice(foundElementIndex, 1);
  }
};

export default removeEnabledElement;
