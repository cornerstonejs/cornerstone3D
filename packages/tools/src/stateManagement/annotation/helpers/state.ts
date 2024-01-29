import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
  getEnabledElementByIds,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import { Events } from '../../../enums';
import { Annotation } from '../../../types/AnnotationTypes';
import ChangeTypes from '../../../enums/ChangeTypes';
import { getToolGroupsWithToolName } from '../../../store/ToolGroupManager';
import {
  AnnotationAddedEventDetail,
  AnnotationModifiedEventDetail,
  AnnotationCompletedEventDetail,
} from '../../../types/EventTypes';

type IEnabledElement = Types.IEnabledElement;

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

  const eventType = Events.ANNOTATION_ADDED;
  const eventDetail: AnnotationAddedEventDetail = { annotation };

  if (!viewportsToRender.length) {
    triggerEvent(eventTarget, eventType, eventDetail);
    return;
  }

  viewportsToRender.forEach(({ renderingEngineId, viewportId }) => {
    eventDetail.viewportId = viewportId;
    eventDetail.renderingEngineId = renderingEngineId;
    triggerEvent(eventTarget, eventType, eventDetail);
  });
}

/**
 * Triggers an annotation modified event.
 */
function triggerAnnotationModified(
  annotation: Annotation,
  element: HTMLDivElement | IEnabledElement,
  changeType = ChangeTypes.HandlesUpdated
): void {
  const enabledElement = getEnabledElement(element);
  const { viewportId, renderingEngineId } = enabledElement;
  const eventType = Events.ANNOTATION_MODIFIED;
  const eventDetail: AnnotationModifiedEventDetail = {
    annotation,
    viewportId,
    renderingEngineId,
    changeType,
  };

  triggerEvent(eventTarget, eventType, eventDetail);
}

/**
 * Triggers an annotation completed event.
 */
function triggerAnnotationCompleted(annotation: Annotation): void {
  const eventType = Events.ANNOTATION_COMPLETED;
  const eventDetail: AnnotationCompletedEventDetail = {
    annotation,
  };

  triggerEvent(eventTarget, eventType, eventDetail);
}

export {
  triggerAnnotationAddedForElement,
  triggerAnnotationAddedForFOR,
  triggerAnnotationModified,
  triggerAnnotationCompleted,
};
