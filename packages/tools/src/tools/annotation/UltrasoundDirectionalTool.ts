import { Events } from '../../enums';
import {
  getEnabledElement,
  utilities as csUtils,
  StackViewport,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from '../base';
import throttle from '../../utilities/throttle';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import {
  triggerAnnotationCompleted,
  triggerAnnotationModified,
} from '../../stateManagement/annotation/helpers/state';
import { UltrasoundDirectionalAnnotation } from '../../types/ToolSpecificAnnotationTypes';

import {
  drawHandle as drawHandleSvg,
  drawLine as drawLineSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg';
import { state } from '../../store';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { roundNumber } from '../../utilities';
import { distanceToPoint } from '../../utilities/math/point';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';

import {
  resetElementCursor,
  hideElementCursor,
} from '../../cursors/elementCursor';

import {
  EventTypes,
  ToolHandle,
  TextBoxHandle,
  PublicToolProps,
  ToolProps,
  SVGDrawingHelper,
  Annotation,
  InteractionTypes,
} from '../../types';
import { StyleSpecifier } from '../../types/AnnotationStyle';
import { getCalibratedProbeUnitsAndValue } from '../../utilities/getCalibratedUnits';
const { transformWorldToIndex } = csUtils;

/**
 * The `UltrasoundDirectionalTool` class is a tool for creating directional ultrasound annotations.
 * It allows users to draw lines and measure distances between two points in the image.
 * It automatically calculates the distance based on the relevant unit of measurement.
 */
class UltrasoundDirectionalTool extends AnnotationTool {
  static toolName;

  public touchDragCallback: any;
  public mouseDragCallback: any;
  startedDrawing: boolean;
  _throttledCalculateCachedStats: any;
  editData: {
    annotation: any;
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox?: boolean;
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
        getTextLines: defaultGetTextLines,
        /**
         * Determines whether both horizontal and vertical distances should be displayed
         * in the text lines when generating annotations' measurement information.
         */
        displayBothAxesDistances: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    );
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Ultrasound Directional Tool and store it in the annotationManager
   *
   * @param evt -  EventTypes.InteractionEventType
   * @returns The annotation object.
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): UltrasoundDirectionalAnnotation => {
    if (this.startedDrawing) {
      return;
    }

    this.startedDrawing = true;
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;

    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

    if (!(viewport instanceof StackViewport)) {
      throw new Error(
        'UltrasoundDirectionalTool can only be used on a StackViewport'
      );
    }

    hideElementCursor(element);
    this.isDrawing = true;

    const camera = viewport.getCamera();
    const { viewPlaneNormal, viewUp } = camera;

    const referencedImageId = this.getReferencedImageId(
      viewport,
      worldPos,
      viewPlaneNormal,
      viewUp
    );

    const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();

    const annotation = {
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
        handles: {
          points: [<Types.Point3>[...worldPos], <Types.Point3>[...worldPos]],
          activeHandleIndex: null,
          textBox: {
            hasMoved: false,
            worldPosition: <Types.Point3>[0, 0, 0],
            worldBoundingBox: {
              topLeft: <Types.Point3>[0, 0, 0],
              topRight: <Types.Point3>[0, 0, 0],
              bottomLeft: <Types.Point3>[0, 0, 0],
              bottomRight: <Types.Point3>[0, 0, 0],
            },
          },
        },
        label: '',
        cachedStats: {},
      },
    };

    addAnnotation(annotation, element);

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex: 1,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    };
    this._activateDraw(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  };

  /**
   * It returns if the canvas point is near the provided length annotation in the provided
   * element or not. A proximity is passed to the function to determine the
   * proximity of the point to the annotation in number of pixels.
   *
   * @param element - HTML Element
   * @param annotation - Annotation
   * @param canvasCoords - Canvas coordinates
   * @param proximity - Proximity to tool to consider
   * @returns Boolean, whether the canvas point is near tool
   */
  isPointNearTool = (
    element: HTMLDivElement,
    annotation: UltrasoundDirectionalAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    return false;
  };

  toolSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    interactionType: InteractionTypes,
    canvasCoords?: Types.Point2
  ): void {
    return;
  }

  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: UltrasoundDirectionalAnnotation,
    handle: ToolHandle
  ): void {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    let movingTextBox = false;
    let handleIndex;
    if ((handle as TextBoxHandle).worldPosition) {
      movingTextBox = true;
    } else {
      handleIndex = data.handles.points.findIndex((p) => p === handle);
    }

    // Find viewports to render on drag.

    this.editData = {
      handleIndex,
      annotation,
      viewportIdsToRender,
    };
    this._activateModify(element);

    hideElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  }

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved } =
      this.editData;

    const { data } = annotation;
    if (newAnnotation && !hasMoved) {
      // when user starts the drawing by click, and moving the mouse, instead
      // of click and drag
      return;
    }

    // If preventing new measurement means we are in the middle of an existing measurement
    // we shouldn't deactivate modify or draw
    if (this.startedDrawing && data.handles.points.length === 1) {
      // adds the last point to the measurement
      this.editData.handleIndex = 1;
      return;
    }

    this.startedDrawing = false;
    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);
    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID);
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }

    this.editData = null;
    this.isDrawing = false;
  };

  _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, handleIndex, movingTextBox } =
      this.editData;
    const { data } = annotation;

    if (movingTextBox) {
      // Drag mode - moving text box
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
      // Drag mode - moving handle
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;

      const points = data.handles.points;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
      annotation.invalidated = true;
    } else {
      // Move mode - after double click, and mouse move to draw
      const { currentPoints } = eventDetail;
      const worldPos = currentPoints.world;

      data.handles.points[handleIndex] = [...worldPos];
      annotation.invalidated = true;
    }

    this.editData.hasMoved = true;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  cancel = (element: HTMLDivElement) => {
    // If it is mid-draw or mid-modify
    if (this.isDrawing) {
      this.isDrawing = false;
      this._deactivateDraw(element);
      this._deactivateModify(element);
      resetElementCursor(element);

      const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
      const { data } = annotation;

      annotation.highlighted = false;
      data.handles.activeHandleIndex = null;

      const enabledElement = getEnabledElement(element);
      const { renderingEngine } = enabledElement;

      triggerAnnotationRenderForViewportIds(
        renderingEngine,
        viewportIdsToRender
      );

      if (newAnnotation) {
        triggerAnnotationCompleted(annotation);
      }

      this.editData = null;
      this.startedDrawing = false;
      return annotation.annotationUID;
    }
  };

  _activateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.addEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
  };

  _deactivateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
  };

  _activateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_MOVE,
      this._dragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.addEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
  };

  _deactivateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_MOVE,
      this._dragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._endCallback as EventListener
    );

    element.removeEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._dragCallback as EventListener
    );
  };

  /**
   * it is used to draw the length annotation in each
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

    // Todo: We don't need this anymore, filtering happens in triggerAnnotationRender
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

    const targetId = this.getTargetId(viewport);
    const renderingEngine = viewport.getRenderingEngine();

    const styleSpecifier: StyleSpecifier = {
      toolGroupId: this.toolGroupId,
      toolName: this.getToolName(),
      viewportId: enabledElement.viewport.id,
    };

    // Draw SVG
    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as UltrasoundDirectionalAnnotation;
      const { annotationUID, data } = annotation;
      const { points } = data.handles;

      styleSpecifier.annotationUID = annotationUID;

      const color = this.getStyle('color', styleSpecifier, annotation);

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      // WE HAVE TO CACHE STATS BEFORE FETCHING TEXT
      if (
        !data.cachedStats[targetId] ||
        data.cachedStats[targetId].xValues == null
      ) {
        data.cachedStats[targetId] = {
          xValues: [0, 0],
          yValues: [0, 0],
          isHorizontal: false,
          units: [''],
          isUnitless: false,
        };

        this._calculateCachedStats(annotation, renderingEngine, enabledElement);
      } else if (annotation.invalidated) {
        this._throttledCalculateCachedStats(
          annotation,
          renderingEngine,
          enabledElement
        );
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      // draw first point
      let handleGroupUID = '0';
      drawHandleSvg(
        svgDrawingHelper,
        annotationUID,
        handleGroupUID,
        canvasCoordinates[0],
        {
          color,
        },
        0
      );

      renderStatus = true;

      if (canvasCoordinates.length !== 2) {
        return renderStatus;
      }

      handleGroupUID = '1';
      drawHandleSvg(
        svgDrawingHelper,
        annotationUID,
        handleGroupUID,
        canvasCoordinates[1],
        {
          color,
        },
        1
      );

      const isUnitless = data.cachedStats[targetId].isUnitless;

      if (!isUnitless) {
        const canvasPoint1 = canvasCoordinates[0];
        const canvasPoint2 = canvasCoordinates[1];

        const canvasDeltaY = canvasPoint2[1] - canvasPoint1[1];
        const canvasDeltaX = canvasPoint2[0] - canvasPoint1[0];

        const isHorizontal = data.cachedStats[targetId].isHorizontal;

        // then for the third point we need to go from first point towards
        // the second point (it can be left or right in the horizontal orientation)
        // or up or down in the vertical orientation, and only add
        // the delta y to the x or y coordinate of the first point
        let projectedPointCanvas = [0, 0] as Types.Point2;
        if (isHorizontal) {
          projectedPointCanvas = [
            canvasPoint1[0] + canvasDeltaX,
            canvasPoint1[1],
          ];
        } else {
          projectedPointCanvas = [
            canvasPoint1[0],
            canvasPoint1[1] + canvasDeltaY,
          ];
        }

        // create a line from the first point to the third point
        let dataId = `${annotationUID}-line-1`;
        let lineUID = '1';
        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          canvasCoordinates[0],
          projectedPointCanvas,
          {
            color,
            width: 1,
            shadow: this.configuration.shadow,
          },
          dataId
        );

        // draw another line from first point to the projected one
        dataId = `${annotationUID}-line-2`;
        lineUID = '2';

        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          canvasCoordinates[1],
          projectedPointCanvas,
          {
            color,
            width: 1,
            lineDash: [1, 1],
            shadow: this.configuration.shadow,
          },
          dataId
        );
      } else {
        // draw straight line between the two points
        const dataId = `${annotationUID}-line-1`;
        const lineUID = '1';
        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          canvasCoordinates[0],
          canvasCoordinates[1],
          {
            color,
            width: 1,
            shadow: this.configuration.shadow,
          },
          dataId
        );
      }

      // draw another line from first point to the

      const options = this.getLinkedTextBoxStyle(styleSpecifier, annotation);
      if (!options.visibility) {
        data.handles.textBox = {
          hasMoved: false,
          worldPosition: <Types.Point3>[0, 0, 0],
          worldBoundingBox: {
            topLeft: <Types.Point3>[0, 0, 0],
            topRight: <Types.Point3>[0, 0, 0],
            bottomLeft: <Types.Point3>[0, 0, 0],
            bottomRight: <Types.Point3>[0, 0, 0],
          },
        };
        continue;
      }

      const textLines = this.configuration.getTextLines(
        data,
        targetId,
        this.configuration
      );

      if (!data.handles.textBox.hasMoved) {
        // linked to the vertex by default
        const canvasTextBoxCoords = canvasCoordinates[1];

        data.handles.textBox.worldPosition =
          viewport.canvasToWorld(canvasTextBoxCoords);
      }

      const textBoxPosition = viewport.worldToCanvas(
        data.handles.textBox.worldPosition
      );

      const textBoxUID = '1';
      const boundingBox = drawLinkedTextBoxSvg(
        svgDrawingHelper,
        annotationUID,
        textBoxUID,
        textLines,
        textBoxPosition,
        canvasCoordinates,
        {},
        options
      );

      const { x: left, y: top, width, height } = boundingBox;

      data.handles.textBox.worldBoundingBox = {
        topLeft: viewport.canvasToWorld([left, top]),
        topRight: viewport.canvasToWorld([left + width, top]),
        bottomLeft: viewport.canvasToWorld([left, top + height]),
        bottomRight: viewport.canvasToWorld([left + width, top + height]),
      };
    }

    return renderStatus;
  };

  _calculateCachedStats(annotation, renderingEngine, enabledElement) {
    const data = annotation.data;
    const { element } = enabledElement.viewport;

    // Until we have all two anchors bail out
    if (data.handles.points.length !== 2) {
      return;
    }

    const { cachedStats } = data;
    const targetIds = Object.keys(cachedStats);

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];

      const image = this.getTargetIdImage(targetId, renderingEngine);

      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!image) {
        continue;
      }

      const { imageData } = image;

      const worldPos1 = data.handles.points[0];
      const worldPos2 = data.handles.points[1];

      const imageIndex1 = transformWorldToIndex(imageData, worldPos1);
      const imageIndex2 = transformWorldToIndex(imageData, worldPos2);

      const { values: values1, units: units1 } =
        getCalibratedProbeUnitsAndValue(image, [imageIndex1]);
      const { values: values2, units: units2 } =
        getCalibratedProbeUnitsAndValue(image, [imageIndex2]);

      let xValues, yValues, units, isHorizontal;
      let isUnitless = false;
      if (
        units1[0] !== units2[0] ||
        units1[1] !== units2[1] ||
        (units1[0] === 'raw' && units2[0] === 'raw')
      ) {
        // if units are not the same, we cannot calculate the diff
        // so we just report the px distance
        const value = distanceToPoint(worldPos1, worldPos2);

        xValues = [value, 0];
        yValues = [value, 0];
        units = ['px'];
        isUnitless = true;
      } else {
        const canvasPoint1 = enabledElement.viewport.worldToCanvas(worldPos1);
        const canvasPoint2 = enabledElement.viewport.worldToCanvas(worldPos2);

        const canvasDeltaY = canvasPoint2[1] - canvasPoint1[1];
        const canvasDeltaX = canvasPoint2[0] - canvasPoint1[0];

        isHorizontal = Math.abs(canvasDeltaX) > Math.abs(canvasDeltaY);
        xValues = [values1[0], values2[0]];
        yValues = [values1[1], values2[1]];

        units = [units1[0], units1[1]];
      }

      cachedStats[targetId] = {
        xValues,
        yValues,
        isHorizontal,
        units,
        isUnitless,
      };
    }

    annotation.invalidated = false;

    // Dispatching annotation modified
    triggerAnnotationModified(annotation, element);

    return cachedStats;
  }
}

function defaultGetTextLines(data, targetId, configuration): string[] {
  const cachedStats = data.cachedStats[targetId];
  const { xValues, yValues, units, isUnitless, isHorizontal } = cachedStats;

  if (isUnitless) {
    return [`${roundNumber(xValues[0])} px`];
  }

  if (configuration.displayBothAxesDistances) {
    const dist1 = Math.abs(xValues[1] - xValues[0]);
    const dist2 = Math.abs(yValues[1] - yValues[0]);
    return [
      `${roundNumber(dist1)} ${units[0]}`,
      `${roundNumber(dist2)} ${units[1]}`,
    ];
  }

  if (isHorizontal) {
    const dist = Math.abs(xValues[1] - xValues[0]);
    return [`${roundNumber(dist)} ${units[0]}`];
  } else {
    const dist = Math.abs(yValues[1] - yValues[0]);
    return [`${roundNumber(dist)} ${units[1]}`];
  }
}

UltrasoundDirectionalTool.toolName = 'UltrasoundDirectionalTool';
export default UltrasoundDirectionalTool;
