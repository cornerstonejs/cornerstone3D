import { defaultFrameOfReferenceSpecificToolStateManager } from './FrameOfReferenceSpecificToolStateManager';
import { getEnabledElement } from '../../index';

function getViewportSpecificStateManager(element) {
  // TODO:
  // We may want multiple FrameOfReferenceSpecificStateManagers.
  // E.g. displaying two different radiologists annotations on the same underlying data/FoR.

  // Just return the default for now.

  return defaultFrameOfReferenceSpecificToolStateManager;
}

function getToolState(element, toolName) {
  const toolStateManager = getViewportSpecificStateManager(element);
  const enabledElement = getEnabledElement(element);
  const { FrameOfReferenceUID } = enabledElement;

  return toolStateManager.get(FrameOfReferenceUID, toolName);
}

function addToolState(element, toolData) {
  const toolStateManager = getViewportSpecificStateManager(element);

  toolStateManager.addToolState(toolData);
}

export { getToolState, addToolState };
