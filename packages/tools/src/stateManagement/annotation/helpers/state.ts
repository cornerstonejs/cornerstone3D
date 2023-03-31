import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
  getEnabledElementByIds,
} from '@cornerstonejs/core';
import { Events } from '../../../enums';
import { Annotation } from '../../../types/AnnotationTypes';
import { getToolGroupsWithToolName } from '../../../store/ToolGroupManager';
import { AnnotationAddedEventDetail } from '../../../types/EventTypes';

/**
 * It triggers an event for the element when an annotation is added
 * @param annotation - Annotation - The annotation that was added.
 * @param element - The element that the annotation was added to.
 */
function triggerAnnotationAddedForElement(
  annotation: Annotation,
  element: HTMLDivElement
) {
  const enabledElement = getEnabledElement(element);
  const { renderingEngine, viewportId } = enabledElement;

  const eventType = Events.ANNOTATION_ADDED;

  const eventDetail: AnnotationAddedEventDetail = {
    annotation,
    viewportId,
    renderingEngineId: renderingEngine.id,
  };

  triggerEvent(eventTarget, eventType, eventDetail);
}

/**
 * If the annotation has a FrameOfReferenceUID, it triggers the ANNOTATION_ADDED
 * event for all the viewports that has the same FrameOfReferenceUID.
 * @param annotation -  Annotation - The annotation that was added
 */
function triggerAnnotationAddedForFOR(annotation: Annotation) {
  const { toolName } = annotation.metadata;

  const toolGroups = getToolGroupsWithToolName(toolName);

  if (!toolGroups.length) {
    return;
  }

  // Find the viewports in the toolGroups who has the same FrameOfReferenceUID
  const viewportsToRender = [];

  toolGroups.forEach((toolGroup) => {
    toolGroup.viewportsInfo.forEach((viewportInfo) => {
      const { renderingEngineId, viewportId } = viewportInfo;
      const { FrameOfReferenceUID } = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (annotation.metadata.FrameOfReferenceUID === FrameOfReferenceUID) {
        viewportsToRender.push(viewportInfo);
      }
    });
  });

  if (!viewportsToRender.length) {
    return;
  }

  const eventType = Events.ANNOTATION_ADDED;

  viewportsToRender.forEach(({ renderingEngineId, viewportId }) => {
    const eventDetail: AnnotationAddedEventDetail = {
      annotation,
      viewportId,
      renderingEngineId,
    };

    triggerEvent(eventTarget, eventType, eventDetail);
  });
}

export { triggerAnnotationAddedForElement, triggerAnnotationAddedForFOR };
