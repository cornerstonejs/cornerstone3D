/* eslint-disable @typescript-eslint/no-empty-function */
import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  drawHandles as drawHandlesSvg,
  drawTextBox as drawTextBoxSvg,
} from '../../drawingSvg';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { hideElementCursor } from '../../cursors/elementCursor';
import {
  EventTypes,
  PublicToolProps,
  SVGDrawingHelper,
  ToolProps,
} from '../../types';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import ProbeTool from './ProbeTool';
import { ProbeAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import { isViewportPreScaled } from '../../utilities/viewport/isViewportPreScaled';

class DragProbeTool extends ProbeTool {
  static toolName;

  touchDragCallback: any;
  mouseDragCallback: any;
  editData: {
    annotation: any;
    viewportIdsToRender: string[];
    newAnnotation?: boolean;
  } | null;
  eventDispatchDetail: {
    viewportId: string;
    renderingEngineId: string;
  };
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

  postMouseDownCallback = (
    evt: EventTypes.InteractionEventType
  ): ProbeAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    this.isDrawing = true;
    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const annotation: ProbeAnnotation = {
      invalidated: true,
      highlighted: true,
      isVisible: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
      },
      data: {
        label: '',
        handles: { points: [<Types.Point3>[...worldPos]] },
        cachedStats: {},
      },
    };

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      newAnnotation: true,
      viewportIdsToRender,
    };
    this._activateModify(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  postTouchStartCallback = (
    evt: EventTypes.InteractionEventType
  ): ProbeAnnotation => {
    return this.postMouseDownCallback(evt);
  };

  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;

    if (!this.editData) {
      return renderStatus;
    }

    const annotations = this.filterInteractableAnnotationsForElement(
      viewport.element,
      [this.editData.annotation]
    );

    if (!annotations?.length) {
      return renderStatus;
    }

    const targetId = this.getTargetId(viewport);
    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    const annotation = this.editData.annotation;
    const annotationUID = annotation.annotationUID;
    const data = annotation.data;
    const point = data.handles.points[0];
    const canvasCoordinates = viewport.worldToCanvas(point);

    styleSpecifier.annotationUID = annotationUID;

    const color = this.getStyle('color', styleSpecifier, annotation);

    if (!data.cachedStats[targetId]) {
      data.cachedStats[targetId] = {
        Modality: null,
        index: null,
        value: null,
      };

      this._calculateCachedStats(annotation, renderingEngine, enabledElement);
    } else if (annotation.invalidated) {
      this._calculateCachedStats(annotation, renderingEngine, enabledElement);
    }

    // If rendering engine has been destroyed while rendering
    if (!viewport.getRenderingEngine()) {
      console.warn('Rendering Engine has been destroyed');
      return renderStatus;
    }

    const handleGroupUID = '0';

    drawHandlesSvg(
      svgDrawingHelper,
      annotationUID,
      handleGroupUID,
      [canvasCoordinates],
      { color }
    );

    renderStatus = true;

    const isPreScaled = isViewportPreScaled(viewport, targetId);

    const textLines = this._getTextLines(data, targetId, isPreScaled);
    if (textLines) {
      const textCanvasCoordinates = [
        canvasCoordinates[0] + 6,
        canvasCoordinates[1] - 6,
      ];

      const textUID = '0';
      drawTextBoxSvg(
        svgDrawingHelper,
        annotationUID,
        textUID,
        textLines,
        [textCanvasCoordinates[0], textCanvasCoordinates[1]],
        this.getLinkedTextBoxStyle(styleSpecifier, annotation)
      );
    }

    return renderStatus;
  };
}

DragProbeTool.toolName = 'DragProbe';
export default DragProbeTool;
