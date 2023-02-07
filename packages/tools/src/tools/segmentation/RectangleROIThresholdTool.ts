import {
  getEnabledElement,
  cache,
  StackViewport,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { addAnnotation, getAnnotations } from '../../stateManagement';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { Events } from '../../enums';

import {
  drawHandles as drawHandlesSvg,
  drawRect as drawRectSvg,
} from '../../drawingSvg';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { hideElementCursor } from '../../cursors/elementCursor';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  PublicToolProps,
  ToolProps,
  EventTypes,
  SVGDrawingHelper,
} from '../../types';
import { RectangleROIThresholdAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { AnnotationModifiedEventDetail } from '../../types/EventTypes';
import RectangleROITool from '../annotation/RectangleROITool';
import { StyleSpecifier } from '../../types/AnnotationStyle';

/**
 * This tool is exactly the RectangleROITool but only draws a rectangle on the image,
 * and by using utility functions such as thresholdByRange and thresholdByROIStat it can be used to
 * create a segmentation. This tool, however, does not calculate the statistics
 * as RectangleROITool does.
 */
class RectangleROIThresholdTool extends RectangleROITool {
  static toolName;
  _throttledCalculateCachedStats: any;
  editData: {
    annotation: any;
    viewportIdsToRender: string[];
    handleIndex?: number;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  /**
   * Based on the current position of the mouse and the enabledElement it creates
   * the edit data for the tool.
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const targetId = this.getTargetId(viewport);
    let referencedImageId, volumeId;

    if (viewport instanceof StackViewport) {
      referencedImageId = targetId.split('imageId:')[1];
    } else {
      volumeId = targetId.split('volumeId:')[1];
      const imageVolume = cache.getVolume(volumeId);
      referencedImageId = csUtils.getClosestImageId(
        imageVolume,
        worldPos,
        viewPlaneNormal,
        viewUp
      );
    }

    // Todo: how not to store enabledElement on the annotation, segmentationModule needs the element to
    // decide on the active segmentIndex, active segmentationIndex etc.
    const annotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        enabledElement,
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
        toolName: this.getToolName(),
        volumeId,
      },
      data: {
        label: '',
        handles: {
          // No need a textBox
          textBox: {
            hasMoved: false,
            worldPosition: null,
            worldBoundingBox: null,
          },
          points: [
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
          ],
          activeHandleIndex: null,
        },
        segmentationId: null,
      },
    };

    addAnnotation(element, annotation);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex: 3,
      newAnnotation: true,
      hasMoved: false,
    };
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  /**
   * it is used to draw the RectangleROI Threshold annotation in each
   * request animation frame.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport, renderingEngineId } = enabledElement;
    const { element } = viewport;
    let annotations = getAnnotations(element, this.getToolName());

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (!annotations?.length) {
      return renderStatus;
    }

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as RectangleROIThresholdAnnotation;
      const { annotationUID, data } = annotation;
      const { points, activeHandleIndex } = data.handles;
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      // Todo: This is not correct way to add the event trigger,
      // this will trigger on all mouse hover too. Problem is that we don't
      // have a cached stats mechanism for this tool yet?
      const eventType = Events.ANNOTATION_MODIFIED;

      const eventDetail: AnnotationModifiedEventDetail = {
        annotation,
        viewportId: viewport.id,
        renderingEngineId,
      };

      triggerEvent(eventTarget, eventType, eventDetail);

      let activeHandleCanvasCoords;

      if (!isAnnotationVisible(annotationUID)) {
        continue;
      }

      if (
        !isAnnotationLocked(annotation) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
      }

      if (activeHandleCanvasCoords) {
        const handleGroupUID = '0';

        drawHandlesSvg(
          svgDrawingHelper,
          annotationUID,
          handleGroupUID,
          activeHandleCanvasCoords,
          {
            color,
          }
        );
      }

      const rectangleUID = '0';
      drawRectSvg(
        svgDrawingHelper,
        annotationUID,
        rectangleUID,
        canvasCoordinates[0],
        canvasCoordinates[3],
        {
          color,
          lineDash,
          lineWidth,
        }
      );

      renderStatus = true;
    }

    return renderStatus;
  };
}

RectangleROIThresholdTool.toolName = 'RectangleROIThreshold';
export default RectangleROIThresholdTool;
