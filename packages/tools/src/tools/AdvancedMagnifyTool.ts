import { AnnotationTool } from './base';

import { getEnabledElement, utilities as csUtils } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import {
  addAnnotation,
  getAnnotations,
} from '../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../stateManagement/annotation/annotationVisibility';
import { triggerAnnotationCompleted } from '../stateManagement/annotation/helpers/state';
import {
  drawCircle as drawCircleSvg,
  drawHandles as drawHandlesSvg,
} from '../drawingSvg';
import { state } from '../store';
import { Events, MouseBindings, KeyboardBindings } from '../enums';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import {
  resetElementCursor,
  hideElementCursor,
} from '../cursors/elementCursor';
import {
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
} from '../types';
import { AdvancedMagnifyAnnotation } from '../types/ToolSpecificAnnotationTypes';

import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import { StyleSpecifier } from '../types/AnnotationStyle';
import { getCanvasCircleRadius } from '../utilities/math/circle';
import AdvancedMagnifyViewportManager from './AdvancedMagnifyViewportManager';
import type { AutoPanCallbackData } from './AdvancedMagnifyViewport';

enum AdvancedMagnifyToolActions {
  ShowZoomFactorsList = 'showZoomFactorsList',
}

class AdvancedMagnifyTool extends AnnotationTool {
  static toolName;
  static Actions = AdvancedMagnifyToolActions;

  magnifyViewportManager: AdvancedMagnifyViewportManager;
  touchDragCallback: any;
  mouseDragCallback: any;
  editData: {
    annotation: any;
    viewportIdsToRender: Array<string>;
    handleIndex?: number;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        magnifyingGlass: {
          radius: 125, // px
          zoomFactor: 2.5,
          zoomFactorList: [2.5, 3, 3.5, 4, 4.5, 5],
          autoPan: {
            enabled: true,
            padding: 10, // px
          },
        },
        actions: {
          showZoomFactorsList: {
            method: 'showZoomFactorsList',
            bindings: [
              {
                mouseButton: MouseBindings.Secondary,
                modifierKey: KeyboardBindings.Shift,
              },
            ],
          },
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
    this.magnifyViewportManager = AdvancedMagnifyViewportManager.getInstance();
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a CircleROI Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): AdvancedMagnifyAnnotation => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;
    const worldPos = currentPoints.world;
    const canvasPos = currentPoints.canvas;
    const { magnifyingGlass: config } = this.configuration;
    const { radius, zoomFactor, autoPan } = config;

    const worldHandlesPoints = this._getWorldHandlesPoints(
      viewport,
      canvasPos,
      radius
    );

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const annotationUID = csUtils.uuidv4();
    const magnifyViewportId = csUtils.uuidv4();
    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const annotation: AdvancedMagnifyAnnotation = {
      annotationUID,
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID,
        referencedImageId,
      },
      data: {
        sourceViewportId: viewport.id,
        magnifyViewportId,
        zoomFactor,
        handles: {
          points: worldHandlesPoints,
          activeHandleIndex: null,
        },
      },
    };

    this.magnifyViewportManager.createViewport(annotation, {
      magnifyViewportId,
      sourceEnabledElement: enabledElement,
      position: canvasPos,
      radius,
      zoomFactor,
      autoPan: {
        enabled: autoPan.enabled,
        padding: autoPan.padding,
        callback: (data: AutoPanCallbackData) => {
          const annotationPoints = annotation.data.handles.points;
          const { world: worldDelta } = data.delta;

          for (let i = 0, len = annotationPoints.length; i < len; i++) {
            annotationPoints[i][0] += worldDelta[0];
            annotationPoints[i][1] += worldDelta[1];
            annotationPoints[i][2] += worldDelta[2];
          }
        },
      },
    });

    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    evt.preventDefault();
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  /**
   * It returns if the canvas point is near the provided annotation in the provided
   * element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - Annotation
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  public isPointNearTool = (
    element: HTMLDivElement,
    annotation: AdvancedMagnifyAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = annotation;
    const { points } = data.handles;

    // For some reason Typescript doesn't understand this, so we need to be
    // more specific about the type
    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p)) as [
      Types.Point2,
      Types.Point2,
      Types.Point2,
      Types.Point2
    ];

    const canvasTop = canvasCoordinates[0];
    const canvasBottom = canvasCoordinates[2];
    const canvasLeft = canvasCoordinates[3];
    const radius = Math.abs(canvasBottom[1] - canvasTop[1]) * 0.5;
    const center = [
      canvasLeft[0] + radius,
      canvasTop[1] + radius,
    ] as Types.Point2;
    const radiusPoint = getCanvasCircleRadius([center, canvasCoords]);

    if (Math.abs(radiusPoint - radius) < proximity * 1.5) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: AdvancedMagnifyAnnotation
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
    };

    hideElementCursor(element);

    this._activateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: AdvancedMagnifyAnnotation,
    handle: ToolHandle
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    const { points } = data.handles;
    const handleIndex = points.findIndex((p) => p === handle);

    // Find viewports to render on drag.
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex,
    };
    this._activateModify(element);

    hideElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
    const { data } = annotation;

    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);

    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    this.editData = null;
    this.isDrawing = false;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }
  };

  _dragDrawCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element, deltaPoints } = eventDetail;
    const worldPosDelta = deltaPoints?.world ?? [0, 0, 0];
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    const { annotation, viewportIdsToRender } = this.editData;
    const { points } = annotation.data.handles;

    points.forEach((point) => {
      point[0] += worldPosDelta[0];
      point[1] += worldPosDelta[1];
      point[2] += worldPosDelta[2];
    });

    annotation.invalidated = true;
    this.editData.hasMoved = true;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  _dragModifyCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, handleIndex } = this.editData;
    const { data } = annotation;

    if (handleIndex === undefined) {
      // Moving tool
      const { deltaPoints } = eventDetail;
      const worldPosDelta = deltaPoints.world;

      const points = data.handles.points;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
      annotation.invalidated = true;
    } else {
      this._dragHandle(evt);
      annotation.invalidated = true;
    }

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  _dragHandle = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { worldToCanvas } = viewport;

    const { annotation } = this.editData;
    const { data } = annotation;
    const { points } = data.handles;

    const canvasCoordinates = points.map((p) => worldToCanvas(p));
    const canvasTop = canvasCoordinates[0];
    const canvasBottom = canvasCoordinates[2];
    const canvasLeft = canvasCoordinates[3];
    const radius = Math.abs(canvasBottom[1] - canvasTop[1]) * 0.5;
    const canvasCenter: Types.Point2 = [
      canvasLeft[0] + radius,
      canvasTop[1] + radius,
    ];

    const { currentPoints } = eventDetail;
    const currentCanvasPoints = currentPoints.canvas;

    const newRadius = getCanvasCircleRadius([
      canvasCenter,
      currentCanvasPoints,
    ]);
    const newWorldHandlesPoints = this._getWorldHandlesPoints(
      viewport,
      canvasCenter,
      newRadius
    );

    points[0] = newWorldHandlesPoints[0];
    points[1] = newWorldHandlesPoints[1];
    points[2] = newWorldHandlesPoints[2];
    points[3] = newWorldHandlesPoints[3];
  };

  cancel = (element: HTMLDivElement) => {
    // If it is mid-draw or mid-modify
    if (!this.isDrawing) {
      return;
    }

    this.isDrawing = false;
    this._deactivateModify(element);
    resetElementCursor(element);

    const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
    const { data } = annotation;

    annotation.highlighted = false;
    data.handles.activeHandleIndex = null;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }

    this.editData = null;
    return annotation.annotationUID;
  };

  _activateModify = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  /**
   * it is used to draw the circleROI annotation in each
   * request animation frame. It calculates the updated cached statistics if
   * data is invalidated and cache it.
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport } = enabledElement;
    const { element } = viewport;

    let annotations = getAnnotations(this.getToolName(), element);

    if (!annotations?.length) {
      return renderStatus;
    }

    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    annotations = annotations?.filter(
      (annotation) =>
        (<AdvancedMagnifyAnnotation>annotation).data.sourceViewportId ===
        viewport.id
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
      const annotation = annotations[i] as AdvancedMagnifyAnnotation;
      const { annotationUID, data } = annotation;
      const { magnifyViewportId, zoomFactor, handles } = data;
      const { points, activeHandleIndex } = handles;

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      const canvasCoordinates = points.map((p) =>
        viewport.worldToCanvas(p)
      ) as Types.Point2[];
      const canvasTop = canvasCoordinates[0];
      const canvasBottom = canvasCoordinates[2];
      const canvasLeft = canvasCoordinates[3];
      const radius = Math.abs(canvasBottom[1] - canvasTop[1]) * 0.5;
      const center = [
        canvasLeft[0] + radius,
        canvasTop[1] + radius,
      ] as Types.Point2;

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

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

      const dataId = `${annotationUID}-advancedMagnify`;
      const circleUID = '0';
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        circleUID,
        center,
        radius,
        {
          color,
          lineDash,
          lineWidth,
        },
        dataId
      );

      const magnifyViewport =
        this.magnifyViewportManager.getViewport(magnifyViewportId);

      magnifyViewport.position = center;
      magnifyViewport.radius = radius;
      magnifyViewport.zoomFactor = zoomFactor;
      magnifyViewport.update();

      renderStatus = true;
    }

    return renderStatus;
  };

  // Basic dropdown component that allows the user to select a different zoom factor.
  // configurations.actions may be changed to use a customized dropdown.
  public showZoomFactorsList(
    evt: EventTypes.InteractionEventType,
    annotation: AdvancedMagnifyAnnotation
  ) {
    const { element, currentPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { canvas: canvasPoint } = currentPoints;
    const viewportElement = element.querySelector(':scope .viewport-element');
    const currentZoomFactor = annotation.data.zoomFactor;
    const remove = () => dropdown.parentElement.removeChild(dropdown);

    const dropdown = this._getZoomFactorsListDropdown(
      currentZoomFactor,
      (newZoomFactor) => {
        if (newZoomFactor !== undefined) {
          annotation.data.zoomFactor = Number.parseFloat(newZoomFactor);
          annotation.invalidated = true;
        }

        remove();
        viewport.render();
      }
    );

    Object.assign(dropdown.style, {
      left: `${canvasPoint[0]}px`,
      top: `${canvasPoint[1]}px`,
    });

    viewportElement.appendChild(dropdown);
    dropdown.focus();
  }

  private _getZoomFactorsListDropdown(currentZoomFactor, onChangeCallback) {
    const { zoomFactorList } = this.configuration.magnifyingGlass;
    const dropdown = document.createElement('select');

    dropdown.size = 5;
    Object.assign(dropdown.style, {
      width: '50px',
      position: 'absolute',
    });

    ['mousedown', 'mouseup', 'mousemove', 'click'].forEach((eventName) => {
      dropdown.addEventListener(eventName, (evt) => evt.stopPropagation());
    });

    dropdown.addEventListener('change', (evt) => {
      evt.stopPropagation();
      onChangeCallback(dropdown.value);
    });

    dropdown.addEventListener('keydown', (evt) => {
      const shouldCancel =
        (evt.keyCode ?? evt.which === 27) ||
        evt.key?.toLowerCase() === 'escape';

      if (shouldCancel) {
        evt.stopPropagation();
        onChangeCallback();
      }
    });

    zoomFactorList.forEach((zoomFactor) => {
      const option = document.createElement('option');

      option.label = zoomFactor;
      option.title = `Zoom factor ${zoomFactor.toFixed(1)}`;
      option.value = zoomFactor;
      option.defaultSelected = zoomFactor === currentZoomFactor;

      dropdown.add(option);
    });

    return dropdown;
  }

  private _getWorldHandlesPoints = (
    viewport,
    canvasCenterPos,
    canvasRadius
  ): Types.Point3[] => {
    const canvasHandlesPoints = [
      [canvasCenterPos[0], canvasCenterPos[1] - canvasRadius], // top
      [canvasCenterPos[0] + canvasRadius, canvasCenterPos[1]], // right
      [canvasCenterPos[0], canvasCenterPos[1] + canvasRadius], // bottom
      [canvasCenterPos[0] - canvasRadius, canvasCenterPos[1]], // left
    ];

    const worldHandlesPoints = canvasHandlesPoints.map((p) =>
      viewport.canvasToWorld(p)
    ) as Types.Point3[];

    return worldHandlesPoints;
  };
}

AdvancedMagnifyTool.toolName = 'AdvancedMagnify';

export { AdvancedMagnifyTool as default };
