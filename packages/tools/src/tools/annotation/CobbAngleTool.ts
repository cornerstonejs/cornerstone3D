import { vec3 } from 'gl-matrix';
import { Events } from '../../enums';
import { getEnabledElement } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from '../base';
import throttle from '../../utilities/throttle';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import {
  triggerAnnotationCompleted,
  triggerAnnotationModified,
} from '../../stateManagement/annotation/helpers/state';
import * as lineSegment from '../../utilities/math/line';
import angleBetweenLines from '../../utilities/math/angle/angleBetweenLines';
import { midPoint2 } from '../../utilities/math/midPoint';

import {
  drawHandles as drawHandlesSvg,
  drawLine as drawLineSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
  drawTextBox as drawTextBoxSvg,
} from '../../drawingSvg';
import { state } from '../../store';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
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
  InteractionTypes,
  SVGDrawingHelper,
} from '../../types';
import { CobbAngleAnnotation } from '../../types/ToolSpecificAnnotationTypes';
import { StyleSpecifier } from '../../types/AnnotationStyle';

class CobbAngleTool extends AnnotationTool {
  static toolName;

  public touchDragCallback: any;
  public mouseDragCallback: any;
  angleStartedNotYetCompleted: boolean;
  _throttledCalculateCachedStats: any;
  editData: {
    annotation: any;
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox?: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
    isNearFirstLine?: boolean;
    isNearSecondLine?: boolean;
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
        showArcLines: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      25,
      { trailing: true }
    );
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Length Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation = (
    evt: EventTypes.MouseDownActivateEventType
  ): CobbAngleAnnotation => {
    if (this.angleStartedNotYetCompleted) {
      return;
    }

    this.angleStartedNotYetCompleted = true;
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport, renderingEngine } = enabledElement;

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
    annotation: CobbAngleAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { data } = annotation;

    const { distanceToPoint, distanceToPoint2 } = this.distanceToLines({
      viewport,
      points: data.handles.points,
      canvasCoords,
      proximity,
    });

    if (distanceToPoint <= proximity || distanceToPoint2 <= proximity) {
      return true;
    }

    return false;
  };

  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: CobbAngleAnnotation,
    interactionType: InteractionTypes,
    canvasCoords: Types.Point2,
    proximity = 6
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    annotation.highlighted = true;

    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;

    const { isNearFirstLine, isNearSecondLine } = this.distanceToLines({
      viewport,
      points: annotation.data.handles.points,
      canvasCoords,
      proximity,
    });

    this.editData = {
      annotation,
      viewportIdsToRender,
      movingTextBox: false,
      isNearFirstLine,
      isNearSecondLine,
    };

    this._activateModify(element);

    hideElementCursor(element);

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  handleSelectedCallback(
    evt: EventTypes.MouseDownEventType,
    annotation: CobbAngleAnnotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const { data } = annotation;

    annotation.highlighted = true;

    let movingTextBox = false;
    let handleIndex;

    if ((handle as TextBoxHandle).worldPosition) {
      movingTextBox = true;
    } else {
      handleIndex = data.handles.points.findIndex((p) => p === handle);
    }

    // Find viewports to render on drag.
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName()
    );

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex,
      movingTextBox,
    };
    this._activateModify(element);

    hideElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  }

  _mouseUpCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
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
    if (this.angleStartedNotYetCompleted && data.handles.points.length < 4) {
      resetElementCursor(element);

      // adds the first point of the second line
      this.editData.handleIndex = data.handles.points.length;
      return;
    }

    this.angleStartedNotYetCompleted = false;
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

  /**
   * Handles the mouse down for all points that follow the very first mouse down.
   * The very first mouse down is handled by addAnnotation.
   * This method ensures that the state of the tool is correct for the drawing of the second line segment.
   * In particular it ensures that the second segment can be created via a mouse down and drag.
   */
  _mouseDownCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const { annotation, handleIndex } = this.editData;
    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;
    const worldPos = currentPoints.world;
    const { data } = annotation;

    if (handleIndex === 1) {
      // This is the mouse down for the second point of the first segment.
      // The mouse up takes care of adding the first point of the second segment.
      data.handles.points[1] = worldPos;
      this.editData.hasMoved =
        data.handles.points[1][0] !== data.handles.points[0][0] ||
        data.handles.points[1][1] !== data.handles.points[0][0];
      return;
    }

    if (handleIndex === 3) {
      // This is the mouse down for the second point of the second segment (i.e. the last point)
      data.handles.points[3] = worldPos;
      this.editData.hasMoved =
        data.handles.points[3][0] !== data.handles.points[2][0] ||
        data.handles.points[3][1] !== data.handles.points[2][0];

      this.angleStartedNotYetCompleted = false;
      return;
    }

    // This is the first mouse down of the first point of the second line segment.
    // It is as if we have not moved yet because Cobb Angle has two, disjoint sections, each with its own move.
    this.editData.hasMoved = false;
    hideElementCursor(element);

    // Add the last segment points for the subsequent drag/mouse move.
    data.handles.points[2] = data.handles.points[3] = worldPos;
    this.editData.handleIndex = data.handles.points.length - 1;
  };

  _mouseDragCallback = (
    evt: EventTypes.MouseDragEventType | EventTypes.MouseMoveEventType
  ) => {
    this.isDrawing = true;
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const {
      annotation,
      viewportIdsToRender,
      handleIndex,
      movingTextBox,
      isNearFirstLine,
      isNearSecondLine,
    } = this.editData;
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
    } else if (
      handleIndex === undefined &&
      (isNearFirstLine || isNearSecondLine)
    ) {
      // select tool mode - moving annotation
      const { deltaPoints } = eventDetail as EventTypes.MouseDragEventDetail;
      const worldPosDelta = deltaPoints.world;
      const points = data.handles.points;

      // separate the logic for moving handles to move them separately
      if (isNearFirstLine) {
        const firstLinePoints = [points[0], points[1]];
        firstLinePoints.forEach((point) => {
          point[0] += worldPosDelta[0];
          point[1] += worldPosDelta[1];
          point[2] += worldPosDelta[2];
        });
      } else if (isNearSecondLine) {
        const secondLinePoints = [points[2], points[3]];
        secondLinePoints.forEach((point) => {
          point[0] += worldPosDelta[0];
          point[1] += worldPosDelta[1];
          point[2] += worldPosDelta[2];
        });
      }

      annotation.invalidated = true;
    } else {
      // Drag handle mode - after double click, and mouse move to draw
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
    if (!this.isDrawing) {
      return;
    }

    this.isDrawing = false;
    this._deactivateDraw(element);
    this._deactivateModify(element);
    resetElementCursor(element);

    const { annotation, viewportIdsToRender, newAnnotation } = this.editData;
    const { data } = annotation;

    if (data.handles.points.length < 4) {
      // If it is mid-draw
      removeAnnotation(annotation.annotationUID);
    }

    annotation.highlighted = false;
    data.handles.activeHandleIndex = null;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (newAnnotation) {
      triggerAnnotationCompleted(annotation);
    }

    this.editData = null;
    this.angleStartedNotYetCompleted = false;
    return annotation.annotationUID;
  };

  _activateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._mouseUpCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._mouseUpCallback as EventListener
    );

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  };

  _deactivateModify = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._mouseUpCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._mouseUpCallback as EventListener
    );

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  };

  _activateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = true;

    element.addEventListener(
      Events.MOUSE_UP,
      this._mouseUpCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_MOVE,
      this._mouseDragCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_CLICK,
      this._mouseUpCallback as EventListener
    );
    element.addEventListener(
      Events.MOUSE_DOWN,
      this._mouseDownCallback as EventListener
    );

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
  };

  _deactivateDraw = (element: HTMLDivElement) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(
      Events.MOUSE_UP,
      this._mouseUpCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_MOVE,
      this._mouseDragCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_CLICK,
      this._mouseUpCallback as EventListener
    );
    element.removeEventListener(
      Events.MOUSE_DOWN,
      this._mouseDownCallback as EventListener
    );

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragCallback)
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
      const annotation = annotations[i] as CobbAngleAnnotation;
      const { annotationUID, data } = annotation;
      const { points, activeHandleIndex } = data.handles;

      styleSpecifier.annotationUID = annotationUID;

      const { color, lineWidth, lineDash } = this.getAnnotationStyle({
        annotation,
        styleSpecifier,
      });

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      // WE HAVE TO CACHE STATS BEFORE FETCHING TEXT
      if (
        !data.cachedStats[targetId] ||
        data.cachedStats[targetId].angle == null
      ) {
        data.cachedStats[targetId] = {
          angle: null,
          arc1Angle: null,
          arc2Angle: null,
          points: {
            world: {
              arc1Start: null,
              arc1End: null,
              arc2Start: null,
              arc2End: null,
              arc1Angle: null,
              arc2Angle: null,
            },
            canvas: {
              arc1Start: null,
              arc1End: null,
              arc2Start: null,
              arc2End: null,
              arc1Angle: null,
              arc2Angle: null,
            },
          },
        };

        this._calculateCachedStats(annotation, renderingEngine, enabledElement);
      } else if (annotation.invalidated) {
        this._throttledCalculateCachedStats(
          annotation,
          renderingEngine,
          enabledElement
        );
      }

      let activeHandleCanvasCoords;

      if (
        !isAnnotationLocked(annotation) &&
        !this.editData &&
        activeHandleIndex !== null
      ) {
        // Not locked or creating and hovering over handle, so render handle.
        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
      }

      // If rendering engine has been destroyed while rendering
      if (!viewport.getRenderingEngine()) {
        console.warn('Rendering Engine has been destroyed');
        return renderStatus;
      }

      if (activeHandleCanvasCoords) {
        const handleGroupUID = '0';

        drawHandlesSvg(
          svgDrawingHelper,
          annotationUID,
          handleGroupUID,
          canvasCoordinates,
          {
            color,
            lineDash,
            lineWidth,
          }
        );
      }

      const firstLine = [canvasCoordinates[0], canvasCoordinates[1]] as [
        Types.Point2,
        Types.Point2
      ];
      const secondLine = [canvasCoordinates[2], canvasCoordinates[3]] as [
        Types.Point2,
        Types.Point2
      ];

      let lineUID = 'line1';
      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        lineUID,
        firstLine[0],
        firstLine[1],
        {
          color,
          width: lineWidth,
          lineDash,
        }
      );

      renderStatus = true;

      // Don't add the stats until annotation has 4 anchor points
      if (canvasCoordinates.length < 4) {
        return renderStatus;
      }

      lineUID = 'line2';

      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        lineUID,
        secondLine[0],
        secondLine[1],
        {
          color,
          width: lineWidth,
          lineDash,
        }
      );

      lineUID = 'linkLine';
      const mid1 = midPoint2(firstLine[0], firstLine[1]);
      const mid2 = midPoint2(secondLine[0], secondLine[1]);
      drawLineSvg(svgDrawingHelper, annotationUID, lineUID, mid1, mid2, {
        color,
        lineWidth: '1',
        lineDash: '1,4',
      });

      // Calculating the arcs

      const { arc1Start, arc1End, arc2End, arc2Start } =
        data.cachedStats[targetId].points.canvas;
      const { arc1Angle, arc2Angle } = data.cachedStats[targetId];

      if (this.configuration.showArcLines) {
        lineUID = 'arc1';

        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          arc1Start as Types.Point2,
          arc1End as Types.Point2,
          {
            color,
            lineWidth: '1',
          }
        );

        lineUID = 'arc2';

        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          arc2Start as Types.Point2,
          arc2End as Types.Point2,
          {
            color,
            lineWidth: '1',
          }
        );
      }

      if (!data.cachedStats[targetId]?.angle) {
        continue;
      }

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

      const textLines = this.configuration.getTextLines(data, targetId);

      if (!data.handles.textBox.hasMoved) {
        const canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates);

        data.handles.textBox.worldPosition =
          viewport.canvasToWorld(canvasTextBoxCoords);
      }

      const textBoxPosition = viewport.worldToCanvas(
        data.handles.textBox.worldPosition
      );

      const textBoxUID = 'cobbAngleText';
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

      if (this.configuration.showArcLines) {
        const arc1TextBoxUID = 'arcAngle1';

        const arc1TextLine = [
          `${arc1Angle.toFixed(2)} ${String.fromCharCode(176)}`,
        ];

        const arch1TextPosCanvas = midPoint2(arc1Start, arc1End);

        drawTextBoxSvg(
          svgDrawingHelper,
          annotationUID,
          arc1TextBoxUID,
          arc1TextLine,
          arch1TextPosCanvas,
          {
            ...options,
            padding: 3,
          }
        );

        const arc2TextBoxUID = 'arcAngle2';

        const arc2TextLine = [
          `${arc2Angle.toFixed(2)} ${String.fromCharCode(176)}`,
        ];

        const arch2TextPosCanvas = midPoint2(arc2Start, arc2End);

        drawTextBoxSvg(
          svgDrawingHelper,
          annotationUID,
          arc2TextBoxUID,
          arc2TextLine,
          arch2TextPosCanvas,
          {
            ...options,
            padding: 3,
          }
        );
      }
    }

    return renderStatus;
  };

  _calculateCachedStats(annotation, renderingEngine, enabledElement) {
    const data = annotation.data;

    // Until we have all four anchors bail out
    if (data.handles.points.length !== 4) {
      return;
    }

    const seg1: [Types.Point3, Types.Point3] = [null, null];
    const seg2: [Types.Point3, Types.Point3] = [null, null];
    let minDist = Number.MAX_VALUE;

    // Order the endpoints of each line segment such that seg1[1] and seg2[0]
    // are the closest (Euclidean distance-wise) to each other. Thus
    // the angle formed between the vectors seg1[1]->seg1[0] and seg2[0]->seg[1]
    // is calculated.
    // The assumption here is that the Cobb angle line segments are drawn
    // such that the segments intersect nearest the segment endpoints
    // that are closest AND those closest endpoints are the tails of the
    // vectors used to calculate the angle between the vectors/line segments.
    for (let i = 0; i < 2; i += 1) {
      for (let j = 2; j < 4; j += 1) {
        const dist = vec3.distance(
          data.handles.points[i],
          data.handles.points[j]
        );
        if (dist < minDist) {
          minDist = dist;
          seg1[1] = data.handles.points[i];
          seg1[0] = data.handles.points[(i + 1) % 2];
          seg2[0] = data.handles.points[j];
          seg2[1] = data.handles.points[2 + ((j - 1) % 2)];
        }
      }
    }
    const { viewport } = enabledElement;
    const { element } = viewport;

    const canvasPoints = data.handles.points.map((p) =>
      viewport.worldToCanvas(p)
    );

    const firstLine = [canvasPoints[0], canvasPoints[1]] as [
      Types.Point2,
      Types.Point2
    ];
    const secondLine = [canvasPoints[2], canvasPoints[3]] as [
      Types.Point2,
      Types.Point2
    ];

    const mid1 = midPoint2(firstLine[0], firstLine[1]);
    const mid2 = midPoint2(secondLine[0], secondLine[1]);

    const { arc1Start, arc1End, arc2End, arc2Start, arc1Angle, arc2Angle } =
      this.getArcsStartEndPoints({
        firstLine,
        secondLine,
        mid1,
        mid2,
      });

    const { cachedStats } = data;
    const targetIds = Object.keys(cachedStats);

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];

      cachedStats[targetId] = {
        angle: angleBetweenLines(seg1, seg2),
        arc1Angle,
        arc2Angle,
        points: {
          canvas: {
            arc1Start,
            arc1End,
            arc2End,
            arc2Start,
          },
          world: {
            arc1Start: viewport.canvasToWorld(arc1Start),
            arc1End: viewport.canvasToWorld(arc1End),
            arc2End: viewport.canvasToWorld(arc2End),
            arc2Start: viewport.canvasToWorld(arc2Start),
          },
        },
      };
    }

    annotation.invalidated = false;

    // Dispatching annotation modified
    triggerAnnotationModified(annotation, element);

    return cachedStats;
  }

  distanceToLines = ({ viewport, points, canvasCoords, proximity }) => {
    const [point1, point2, point3, point4] = points;
    const canvasPoint1 = viewport.worldToCanvas(point1);
    const canvasPoint2 = viewport.worldToCanvas(point2);
    const canvasPoint3 = viewport.worldToCanvas(point3);
    const canvasPoint4 = viewport.worldToCanvas(point4);

    const line1 = {
      start: {
        x: canvasPoint1[0],
        y: canvasPoint1[1],
      },
      end: {
        x: canvasPoint2[0],
        y: canvasPoint2[1],
      },
    };

    const line2 = {
      start: {
        x: canvasPoint3[0],
        y: canvasPoint3[1],
      },
      end: {
        x: canvasPoint4[0],
        y: canvasPoint4[1],
      },
    };

    const distanceToPoint = lineSegment.distanceToPoint(
      [line1.start.x, line1.start.y],
      [line1.end.x, line1.end.y],
      [canvasCoords[0], canvasCoords[1]]
    );

    const distanceToPoint2 = lineSegment.distanceToPoint(
      [line2.start.x, line2.start.y],
      [line2.end.x, line2.end.y],
      [canvasCoords[0], canvasCoords[1]]
    );

    let isNearFirstLine = false;
    let isNearSecondLine = false;

    if (distanceToPoint <= proximity) {
      isNearFirstLine = true;
    } else if (distanceToPoint2 <= proximity) {
      isNearSecondLine = true;
    }
    return {
      distanceToPoint,
      distanceToPoint2,
      isNearFirstLine,
      isNearSecondLine,
    };
  };

  getArcsStartEndPoints = ({
    firstLine,
    secondLine,
    mid1,
    mid2,
  }): {
    arc1Start: Types.Point2;
    arc1End: Types.Point2;
    arc2Start: Types.Point2;
    arc2End: Types.Point2;
    arc1Angle: number;
    arc2Angle: number;
  } => {
    const linkLine = [mid1, mid2] as [Types.Point2, Types.Point2];

    const arc1Angle = angleBetweenLines(firstLine, linkLine);
    const arc2Angle = angleBetweenLines(secondLine, linkLine);

    const arc1Side = arc1Angle > 90 ? 1 : 0;
    const arc2Side = arc2Angle > 90 ? 0 : 1;

    const midLinkLine = midPoint2(linkLine[0], linkLine[1]);

    const linkLineLength = Math.sqrt(
      (linkLine[1][0] - linkLine[0][0]) ** 2 +
        (linkLine[1][1] - linkLine[0][1]) ** 2
    );
    const ratio = 0.1; // 10% of the line length

    const midFirstLine = midPoint2(firstLine[0], firstLine[1]);
    const midSecondLine = midPoint2(secondLine[0], secondLine[1]);

    // For arc1Start
    const directionVectorStartArc1 = [
      firstLine[arc1Side][0] - midFirstLine[0],
      firstLine[arc1Side][1] - midFirstLine[1],
    ];
    const magnitudeStartArc1 = Math.sqrt(
      directionVectorStartArc1[0] ** 2 + directionVectorStartArc1[1] ** 2
    );
    const normalizedDirectionStartArc1 = [
      directionVectorStartArc1[0] / magnitudeStartArc1,
      directionVectorStartArc1[1] / magnitudeStartArc1,
    ];
    const arc1Start = [
      midFirstLine[0] +
        normalizedDirectionStartArc1[0] * linkLineLength * ratio,
      midFirstLine[1] +
        normalizedDirectionStartArc1[1] * linkLineLength * ratio,
    ] as Types.Point2;

    // Existing logic for arc1End
    const directionVectorEndArc1 = [
      midLinkLine[0] - mid1[0],
      midLinkLine[1] - mid1[1],
    ];
    const magnitudeEndArc1 = Math.sqrt(
      directionVectorEndArc1[0] ** 2 + directionVectorEndArc1[1] ** 2
    );
    const normalizedDirectionEndArc1 = [
      directionVectorEndArc1[0] / magnitudeEndArc1,
      directionVectorEndArc1[1] / magnitudeEndArc1,
    ];
    const arc1End = [
      mid1[0] + normalizedDirectionEndArc1[0] * linkLineLength * ratio,
      mid1[1] + normalizedDirectionEndArc1[1] * linkLineLength * ratio,
    ] as Types.Point2;

    // Similar logic for arc2Start
    const directionVectorStartArc2 = [
      secondLine[arc2Side][0] - midSecondLine[0],
      secondLine[arc2Side][1] - midSecondLine[1],
    ];
    const magnitudeStartArc2 = Math.sqrt(
      directionVectorStartArc2[0] ** 2 + directionVectorStartArc2[1] ** 2
    );
    const normalizedDirectionStartArc2 = [
      directionVectorStartArc2[0] / magnitudeStartArc2,
      directionVectorStartArc2[1] / magnitudeStartArc2,
    ];
    const arc2Start = [
      midSecondLine[0] +
        normalizedDirectionStartArc2[0] * linkLineLength * ratio,
      midSecondLine[1] +
        normalizedDirectionStartArc2[1] * linkLineLength * ratio,
    ] as Types.Point2;

    // Similar logic for arc2End
    const directionVectorEndArc2 = [
      midLinkLine[0] - mid2[0],
      midLinkLine[1] - mid2[1],
    ];
    const magnitudeEndArc2 = Math.sqrt(
      directionVectorEndArc2[0] ** 2 + directionVectorEndArc2[1] ** 2
    );
    const normalizedDirectionEndArc2 = [
      directionVectorEndArc2[0] / magnitudeEndArc2,
      directionVectorEndArc2[1] / magnitudeEndArc2,
    ];
    const arc2End = [
      mid2[0] + normalizedDirectionEndArc2[0] * linkLineLength * ratio,
      mid2[1] + normalizedDirectionEndArc2[1] * linkLineLength * ratio,
    ] as Types.Point2;

    return {
      arc1Start,
      arc1End,
      arc2Start,
      arc2End,
      arc1Angle: arc1Angle > 90 ? 180 - arc1Angle : arc1Angle,
      arc2Angle: arc2Angle > 90 ? 180 - arc2Angle : arc2Angle,
    };
  };
}

function defaultGetTextLines(data, targetId): string[] {
  const cachedVolumeStats = data.cachedStats[targetId];
  const { angle } = cachedVolumeStats;

  if (angle === undefined) {
    return;
  }

  const textLines = [`${angle.toFixed(2)} ${String.fromCharCode(176)}`];

  return textLines;
}

CobbAngleTool.toolName = 'CobbAngle';
export default CobbAngleTool;
