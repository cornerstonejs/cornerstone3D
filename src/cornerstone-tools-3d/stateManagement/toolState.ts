import { defaultFrameOfReferenceSpecificToolStateManager } from './FrameOfReferenceSpecificToolStateManager';
import { getEnabledElement } from '../../index';
import { uuidv4 } from '../util/';
import { ToolSpecificToolState } from './types';

function getViewportSpecificStateManager(element) {
  // TODO:
  // We may want multiple FrameOfReferenceSpecificStateManagers.
  // E.g. displaying two different radiologists annotations on the same underlying data/FoR.

  // Just return the default for now.

  return defaultFrameOfReferenceSpecificToolStateManager;
}

/**
 * getToolState - Returns the toolState for the `FrameOfReference` of the `Scene`
 * being viewed by the cornerstone3D enabled `element`.
 *
 * @param {HTMLElement} element
 * @param {string} toolName
 * @returns {ToolSpecificToolState} The tool state corresponding to the Frame of Reference and the toolName.
 */
function getToolState(
  element: HTMLElement,
  toolName: string
): ToolSpecificToolState {
  const toolStateManager = getViewportSpecificStateManager(element);
  const enabledElement = getEnabledElement(element);
  const { FrameOfReferenceUID } = enabledElement;

  return toolStateManager.get(FrameOfReferenceUID, toolName);
}

/**
 * @function addToolState
 *
 * @param {*} element
 * @param {*} toolData
 */
function addToolState(element, toolData) {
  const toolStateManager = getViewportSpecificStateManager(element);

  if (toolData.metadata.toolUID === undefined) {
    toolData.metadata.toolUID = uuidv4();
  }

  toolStateManager.addToolState(toolData);
}

export { getToolState, addToolState };
