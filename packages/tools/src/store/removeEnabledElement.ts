import { getEnabledElement, Types } from '@cornerstonejs/core';
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
  keyboardToolEventDispatcher,
  imageSpacingCalibratedEventDispatcher,
  touchToolEventDispatcher,
} from '../eventDispatchers';
// ~~

import filterToolsWithAnnotationsForElement from './filterToolsWithAnnotationsForElement';
import { state } from './state';
import getToolsWithModesForElement from '../utilities/getToolsWithModesForElement';
import { ToolModes } from '../enums';
import { removeAnnotation } from '../stateManagement';
import getSynchronizersForViewport from './SynchronizerManager/getSynchronizersForViewport';
import getToolGroupForViewport from './ToolGroupManager/getToolGroupForViewport';
import { annotationRenderingEngine } from '../utilities/triggerAnnotationRender';

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

  // Dispatchers: renderer
  imageRenderedEventDispatcher.disable(element);
  cameraModifiedEventDispatcher.disable(element);
  imageSpacingCalibratedEventDispatcher.disable(element);
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
      removeAnnotation(annotation.annotationUID, element);
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
