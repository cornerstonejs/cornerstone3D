import { vec2, vec3 } from 'gl-matrix';
import {
  getEnabledElement,
  triggerEvent,
  eventTarget,
  utilities as csUtils,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from '../base';
import throttle from '../../utilities/throttle';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../../stateManagement/annotation/annotationState';
import { isAnnotationLocked } from '../../stateManagement/annotation/annotationLocking';
import { isAnnotationVisible } from '../../stateManagement/annotation/annotationVisibility';
import {
  drawLine as drawLineSvg,
  drawHandles as drawHandlesSvg,
  drawLinkedTextBox as drawLinkedTextBoxSvg,
} from '../../drawingSvg';
import { state } from '../../store';
import { Events } from '../../enums';
import { getViewportIdsWithToolToRender } from '../../utilities/viewportFilters';
import * as lineSegment from '../../utilities/math/line';
import { getTextBoxCoordsCanvas } from '../../utilities/drawing';
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
import { BidirectionalAnnotation } from '../../types/ToolSpecificAnnotationTypes';

import {
  AnnotationCompletedEventDetail,
  AnnotationModifiedEventDetail,
  MouseDragEventType,
  MouseMoveEventType,
} from '../../types/EventTypes';
import triggerAnnotationRenderForViewportIds from '../../utilities/triggerAnnotationRenderForViewportIds';
import { StyleSpecifier } from '../../types/AnnotationStyle';

const { transformWorldToIndex } = csUtils;

/**
 * BidirectionalTool let you draw annotations that measures the length and
 * width at the same time in `mm` unit. It is consisted of two perpendicular lines and
 * a text box. You can use the BidirectionalTool in all planes even in oblique
 * reconstructed planes. Note: annotation tools in cornerstone3DTools exists in the exact location
 * in the physical 3d space, as a result, by default, all annotations that are
 * drawing in the same frameOfReference will get shared between viewports that
 * are in the same frameOfReference.
 *
 * The resulting annotation's data (statistics) and metadata (the
 * state of the viewport while drawing was happening) will get added to the
 * ToolState manager and can be accessed from the ToolState by calling getAnnotations
 * or similar methods.
 *
 * ```js
 * cornerstoneTools.addTool(BidirectionalTool)
 *
 * const toolGroup = ToolGroupManager.createToolGroup('toolGroupId')
 *
 * toolGroup.addTool(BidirectionalTool.toolName)
 *
 * toolGroup.addViewport('viewportId', 'renderingEngineId')
 *
 * toolGroup.setToolActive(BidirectionalTool.toolName, {
 *   bindings: [
 *    {
 *       mouseButton: MouseBindings.Primary, // Left Click
 *     },
 *   ],
 * })
 * ```
 *
 * Read more in the Docs section of the website.
 */
export default class BidirectionalTool extends AnnotationTool {
  static toolName = 'Bidirectional';

  touchDragCallback: any;
  mouseDragCallback: any;
  _throttledCalculateCachedStats: any;
  editData: {
    annotation: any;
    viewportIdsToRender: string[];
    handleIndex?: number;
    movingTextBox: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  isDrawing: boolean;
  isHandleOutsideImage: boolean;
  preventHandleOutsideImage: boolean;

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

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    );
  }

  /**
   * Based on the current position of the mouse and the current imageId to create
   * a Bidirectional Annotation and stores it in the annotationManager
   *
   * @param evt -  EventTypes.NormalizedMouseEventType
   * @returns The annotation object.
   *
   */
  addNewAnnotation(
    evt: EventTypes.MouseDownActivateEventType
  ): BidirectionalAnnotation {
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

    const annotation: BidirectionalAnnotation = {
      highlighted: true,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        viewPlaneNormal: <Types.Point3>[...viewPlaneNormal],
        viewUp: <Types.Point3>[...viewUp],
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID(),
        referencedImageId,
      },
      data: {
        handles: {
          points: [
            // long
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
            // short
            <Types.Point3>[...worldPos],
            <Types.Point3>[...worldPos],
          ],
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
          activeHandleIndex: null,
        },
        label: '',
        cachedStats: {},
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
      handleIndex: 1,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
    };
    this._activateDraw(element);

    hideElementCursor(element);

    evt.preventDefault();

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    return annotation;
  }

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
  isPointNearTool = (
    element: HTMLDivElement,
    annotation: BidirectionalAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { data } = annotation;
    const { points } = data.handles;

    // Check long axis
    let canvasPoint1 = viewport.worldToCanvas(points[0]);
    let canvasPoint2 = viewport.worldToCanvas(points[1]);

    let line = {
      start: {
        x: canvasPoint1[0],
        y: canvasPoint1[1],
      },
      end: {
        x: canvasPoint2[0],
        y: canvasPoint2[1],
      },
    };

    let distanceToPoint = lineSegment.distanceToPoint(
      [line.start.x, line.start.y],
      [line.end.x, line.end.y],
      [canvasCoords[0], canvasCoords[1]]
    );

    if (distanceToPoint <= proximity) {
      return true;
    }

    // Check short axis
    canvasPoint1 = viewport.worldToCanvas(points[2]);
    canvasPoint2 = viewport.worldToCanvas(points[3]);

    line = {
      start: {
        x: canvasPoint1[0],
        y: canvasPoint1[1],
      },
      end: {
        x: canvasPoint2[0],
        y: canvasPoint2[1],
      },
    };

    distanceToPoint = lineSegment.distanceToPoint(
      [line.start.x, line.start.y],
      [line.end.x, line.end.y],
      [canvasCoords[0], canvasCoords[1]]
    );

    if (distanceToPoint <= proximity) {
      return true;
    }

    return false;
  };

  /**
   * Handles the toolSelected callback for bidirectional tool
   * @param evt - EventTypes.MouseDownEventType
   * @param annotation - Bidirectional annotation
   * @param interactionType - interaction type (mouse, touch)
   */
  toolSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: BidirectionalAnnotation,
    interactionType: InteractionTypes
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
      movingTextBox: false,
    };

    this._activateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    hideElementCursor(element);

    evt.preventDefault();
  };

  /**
   * Executes the callback for when mouse has selected a handle (anchor point) of
   * the bidirectional tool or when the text box has been selected.
   *
   * @param evt - EventTypes.MouseDownEventType
   * @param annotation - Bidirectional annotation
   * @param handle - Handle index or selected textBox information
   * @param interactionType - interaction type (mouse, touch)
   */
  handleSelectedCallback = (
    evt: EventTypes.MouseDownEventType,
    annotation: BidirectionalAnnotation,
    handle: ToolHandle,
    interactionType = 'mouse'
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const data = annotation.data;

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

    hideElementCursor(element);

    this.editData = {
      annotation,
      viewportIdsToRender,
      handleIndex,
      movingTextBox,
    };
    this._activateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    evt.preventDefault();
  };

  /**
   * Handles the mouse up action for the bidirectional tool. It can be at the end
   * of the annotation drawing (MouseUpEventType) or when the user clicks and release
   * the mouse button instantly which let to the annotation to draw without holding
   * the mouse button (MouseClickEventType).
   *
   * @param evt - mouse up or mouse click event types
   */
  _mouseUpCallback = (
    evt: EventTypes.MouseUpEventType | EventTypes.MouseClickEventType
  ) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved } =
      this.editData;
    const { data } = annotation;

    if (newAnnotation && !hasMoved) {
      return;
    }

    annotation.highlighted = false;
    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);

    resetElementCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    if (this.editData.handleIndex !== undefined) {
      const { points } = data.handles;
      const firstLineSegmentLength = vec3.distance(points[0], points[1]);
      const secondLineSegmentLength = vec3.distance(points[2], points[3]);

      if (secondLineSegmentLength > firstLineSegmentLength) {
        // Switch points so [0,1] is the long axis and [2,3] is the short axis.

        const longAxis = [[...points[2]], [...points[3]]];

        const shortAxisPoint0 = [...points[0]];
        const shortAxisPoint1 = [...points[1]];

        // shortAxis[0->1] should be perpendicular (counter-clockwise) to longAxis[0->1]
        const longAxisVector = vec2.create();

        vec2.set(
          longAxisVector,
          longAxis[1][0] - longAxis[0][0],
          longAxis[1][1] - longAxis[1][0]
        );

        const counterClockWisePerpendicularToLongAxis = vec2.create();

        vec2.set(
          counterClockWisePerpendicularToLongAxis,
          -longAxisVector[1],
          longAxisVector[0]
        );

        const currentShortAxisVector = vec2.create();

        vec2.set(
          currentShortAxisVector,
          shortAxisPoint1[0] - shortAxisPoint0[0],
          shortAxisPoint1[1] - shortAxisPoint0[0]
        );

        let shortAxis;

        if (
          vec2.dot(
            currentShortAxisVector,
            counterClockWisePerpendicularToLongAxis
          ) > 0
        ) {
          shortAxis = [shortAxisPoint0, shortAxisPoint1];
        } else {
          shortAxis = [shortAxisPoint1, shortAxisPoint0];
        }

        data.handles.points = [
          longAxis[0],
          longAxis[1],
          shortAxis[0],
          shortAxis[1],
        ];
      }
    }

    if (
      this.isHandleOutsideImage &&
      this.configuration.preventHandleOutsideImage
    ) {
      removeAnnotation(annotation.annotationUID, element);
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    if (newAnnotation) {
      const eventType = Events.ANNOTATION_COMPLETED;

      const eventDetail: AnnotationCompletedEventDetail = {
        annotation,
      };

      triggerEvent(eventTarget, eventType, eventDetail);
    }

    this.editData = null;
    this.isDrawing = false;
  };

  /**
   * @param evt - mouse move event type or mouse drag
   */
  _mouseDragDrawCallback = (evt: MouseMoveEventType | MouseDragEventType) => {
    this.isDrawing = true;

    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;
    const { worldToCanvas } = viewport;
    const { annotation, viewportIdsToRender, handleIndex } = this.editData;
    const { data } = annotation;

    const worldPos = currentPoints.world;

    // Update first move handle
    data.handles.points[handleIndex] = [...worldPos];

    const canvasCoordPoints = data.handles.points.map(worldToCanvas);

    const canvasCoords = {
      longLineSegment: {
        start: {
          x: canvasCoordPoints[0][0],
          y: canvasCoordPoints[0][1],
        },
        end: {
          x: canvasCoordPoints[1][0],
          y: canvasCoordPoints[1][1],
        },
      },
      shortLineSegment: {
        start: {
          x: canvasCoordPoints[2][0],
          y: canvasCoordPoints[2][1],
        },
        end: {
          x: canvasCoordPoints[3][0],
          y: canvasCoordPoints[3][1],
        },
      },
    };

    // ~~ calculate worldPos of our short axis handles
    // 1/3 distance between long points
    const dist = vec2.distance(canvasCoordPoints[0], canvasCoordPoints[1]);

    const shortAxisDistFromCenter = dist / 3;
    // Calculate long line's incline
    const dx =
      canvasCoords.longLineSegment.start.x - canvasCoords.longLineSegment.end.x;
    const dy =
      canvasCoords.longLineSegment.start.y - canvasCoords.longLineSegment.end.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const vectorX = dx / length;
    const vectorY = dy / length;
    // middle point between long line segment's points
    const xMid =
      (canvasCoords.longLineSegment.start.x +
        canvasCoords.longLineSegment.end.x) /
      2;
    const yMid =
      (canvasCoords.longLineSegment.start.y +
        canvasCoords.longLineSegment.end.y) /
      2;
    // short points 1/3 distance from center of long points
    const startX = xMid + shortAxisDistFromCenter * vectorY;
    const startY = yMid - shortAxisDistFromCenter * vectorX;
    const endX = xMid - shortAxisDistFromCenter * vectorY;
    const endY = yMid + shortAxisDistFromCenter * vectorX;

    // Update perpendicular line segment's points
    data.handles.points[2] = viewport.canvasToWorld([startX, startY]);
    data.handles.points[3] = viewport.canvasToWorld([endX, endY]);

    annotation.invalidated = true;
    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);

    this.editData.hasMoved = true;
  };

  /**
   * Mouse drag to edit annotation callback
   * @param evt - mouse drag event
   */
  _mouseDragModifyCallback = (evt: MouseDragEventType) => {
    this.isDrawing = true;

    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;
    const { annotation, viewportIdsToRender, handleIndex, movingTextBox } =
      this.editData;
    const { data } = annotation;
    if (movingTextBox) {
      const { deltaPoints } = eventDetail;
      const worldPosDelta = deltaPoints.world;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
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
      this._mouseDragModifyHandle(evt);
      annotation.invalidated = true;
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  /**
   * Mouse dragging a handle callback
   * @param evt - mouse drag event
   */
  _mouseDragModifyHandle = (evt) => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { annotation, handleIndex } = this.editData;
    const { data } = annotation;

    // Moving handle
    const worldPos = currentPoints.world;
    const canvasCoordHandlesCurrent = [
      viewport.worldToCanvas(data.handles.points[0]),
      viewport.worldToCanvas(data.handles.points[1]),
      viewport.worldToCanvas(data.handles.points[2]),
      viewport.worldToCanvas(data.handles.points[3]),
    ];
    // Which line is long? Which line is short?
    const firstLineSegment = {
      start: {
        x: canvasCoordHandlesCurrent[0][0],
        y: canvasCoordHandlesCurrent[0][1],
      },
      end: {
        x: canvasCoordHandlesCurrent[1][0],
        y: canvasCoordHandlesCurrent[1][1],
      },
    };
    const secondLineSegment = {
      start: {
        x: canvasCoordHandlesCurrent[2][0],
        y: canvasCoordHandlesCurrent[2][1],
      },
      end: {
        x: canvasCoordHandlesCurrent[3][0],
        y: canvasCoordHandlesCurrent[3][1],
      },
    };

    // Handle we've selected's proposed point
    const proposedPoint = <Types.Point3>[...worldPos];
    const proposedCanvasCoord = viewport.worldToCanvas(proposedPoint);

    if (handleIndex === 0 || handleIndex === 1) {
      const fixedHandleIndex = handleIndex === 0 ? 1 : 0;

      const fixedCanvasCoord = canvasCoordHandlesCurrent[fixedHandleIndex];

      // Check whether this
      const proposedFirstLineSegment = {
        start: {
          x: fixedCanvasCoord[0],
          y: fixedCanvasCoord[1],
        },
        end: {
          x: proposedCanvasCoord[0],
          y: proposedCanvasCoord[1],
        },
      };

      if (
        this._movingLongAxisWouldPutItThroughShortAxis(
          proposedFirstLineSegment,
          secondLineSegment
        )
      ) {
        return;
      }

      // --> We need to preserve this distance
      const intersectionPoint = lineSegment.intersectLine(
        [secondLineSegment.start.x, secondLineSegment.start.y],
        [secondLineSegment.end.x, secondLineSegment.end.y],
        [firstLineSegment.start.x, firstLineSegment.start.y],
        [firstLineSegment.end.x, firstLineSegment.end.y]
      );

      const intersectionCoord = vec2.create();

      vec2.set(intersectionCoord, intersectionPoint[0], intersectionPoint[1]);

      // 1. distance from intersection point to start handle?
      const distFromLeftHandle = vec2.distance(
        <vec2>canvasCoordHandlesCurrent[2],
        intersectionCoord
      );

      // 2. distance from intersection point to end handle?
      const distFromRightHandle = vec2.distance(
        <vec2>canvasCoordHandlesCurrent[3],
        intersectionCoord
      );

      // 3. distance from long's opposite handle and intersect point
      // Need new intersect x/y
      const distIntersectAndFixedPoint = Math.abs(
        vec2.distance(<vec2>fixedCanvasCoord, intersectionCoord)
      );

      // Find inclination of perpindicular
      // Should use proposed point to find new inclination
      const dx = fixedCanvasCoord[0] - proposedCanvasCoord[0];
      const dy = fixedCanvasCoord[1] - proposedCanvasCoord[1];
      const length = Math.sqrt(dx * dx + dy * dy);
      const vectorX = dx / length;
      const vectorY = dy / length;

      // Find new intersection point
      // --> fixedPoint, magnitude in perpendicular
      // minus if right
      // add if left
      const intersectX =
        fixedCanvasCoord[0] - distIntersectAndFixedPoint * vectorX;
      const intersectY =
        fixedCanvasCoord[1] - distIntersectAndFixedPoint * vectorY;

      // short points 1/4 distance from center of long points
      // Flip signs depending on grabbed handle
      const mod = handleIndex === 0 ? -1 : 1;
      const leftX = intersectX + distFromLeftHandle * vectorY * mod;
      const leftY = intersectY - distFromLeftHandle * vectorX * mod;
      const rightX = intersectX - distFromRightHandle * vectorY * mod;
      const rightY = intersectY + distFromRightHandle * vectorX * mod;

      data.handles.points[handleIndex] = proposedPoint;
      data.handles.points[2] = viewport.canvasToWorld([leftX, leftY]);
      data.handles.points[3] = viewport.canvasToWorld([rightX, rightY]);
    } else {
      // Translation manipulator
      const translateHandleIndex = handleIndex === 2 ? 3 : 2;

      // does not rotate, but can translate entire line (other end of short)
      const proposedCanvasCoordPoint = {
        x: proposedCanvasCoord[0],
        y: proposedCanvasCoord[1],
      };
      const canvasCoordsCurrent = {
        longLineSegment: {
          start: firstLineSegment.start,
          end: firstLineSegment.end,
        },
        shortLineSegment: {
          start: secondLineSegment.start,
          end: secondLineSegment.end,
        },
      };

      // get incline of other line (should not change w/ this movement)
      const dx =
        canvasCoordsCurrent.longLineSegment.start.x -
        canvasCoordsCurrent.longLineSegment.end.x;
      const dy =
        canvasCoordsCurrent.longLineSegment.start.y -
        canvasCoordsCurrent.longLineSegment.end.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const vectorX = dx / length;
      const vectorY = dy / length;
      // Create a helper line to find the intesection point in the long line
      const highNumber = Number.MAX_SAFE_INTEGER;
      // Get the multiplier
      // +1 or -1 depending on which perp end we grabbed (and if it was "fixed" end)
      const mod = handleIndex === 0 || handleIndex === 3 ? 1 : -1;
      const multiplier = mod * highNumber;
      const helperLine = {
        start: proposedCanvasCoordPoint, // could be start or end
        end: {
          x: proposedCanvasCoordPoint.x + vectorY * multiplier,
          y: proposedCanvasCoordPoint.y + vectorX * multiplier * -1,
        },
      };

      const newIntersectionPoint = lineSegment.intersectLine(
        [
          canvasCoordsCurrent.longLineSegment.start.x,
          canvasCoordsCurrent.longLineSegment.start.y,
        ],
        [
          canvasCoordsCurrent.longLineSegment.end.x,
          canvasCoordsCurrent.longLineSegment.end.y,
        ],
        [helperLine.start.x, helperLine.start.y],
        [helperLine.end.x, helperLine.end.y]
      );

      // short-circuit
      if (newIntersectionPoint === undefined) {
        return;
      }

      // 1. distance from intersection point to start handle?
      const distFromTranslateHandle = vec2.distance(
        <vec2>canvasCoordHandlesCurrent[translateHandleIndex],
        [newIntersectionPoint[0], newIntersectionPoint[1]]
      );

      // isStart if index is 0 or 2
      const shortLineSegment = {
        start: {
          x: newIntersectionPoint[0] + vectorY * distFromTranslateHandle,
          y: newIntersectionPoint[1] + vectorX * distFromTranslateHandle * -1,
        },
        end: {
          x: newIntersectionPoint[0] + vectorY * distFromTranslateHandle * -1,
          y: newIntersectionPoint[1] + vectorX * distFromTranslateHandle,
        },
      };
      const translatedHandleCoords =
        translateHandleIndex === 2
          ? shortLineSegment.start
          : shortLineSegment.end;

      data.handles.points[translateHandleIndex] = viewport.canvasToWorld([
        translatedHandleCoords.x,
        translatedHandleCoords.y,
      ]);
      data.handles.points[handleIndex] = proposedPoint;
    }
  };

  /**
   * Cancels an ongoing drawing of a bidirectional annotation
   * @param element - HTML Element
   */
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
        const eventType = Events.ANNOTATION_COMPLETED;

        const eventDetail: AnnotationCompletedEventDetail = {
          annotation,
        };

        triggerEvent(eventTarget, eventType, eventDetail);
      }

      this.editData = null;
      return annotation.annotationUID;
    }
  };

  _activateDraw = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragDrawCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._mouseDragDrawCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback);

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragDrawCallback)
  };

  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._mouseDragDrawCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._mouseDragDrawCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback);

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(Events.TOUCH_DRAG, this._mouseDragDrawCallback)
  };

  _activateModify = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._mouseDragModifyCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._mouseUpCallback);

    // element.addEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.addEventListener(Events.TOUCH_DRAG, this._mouseDragModifyCallback)
  };

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(
      Events.MOUSE_DRAG,
      this._mouseDragModifyCallback
    );
    element.removeEventListener(Events.MOUSE_CLICK, this._mouseUpCallback);

    // element.removeEventListener(Events.TOUCH_END, this._mouseUpCallback)
    // element.removeEventListener(
    //   Events.TOUCH_DRAG,
    //   this._mouseDragModifyCallback
    // )
  };

  /**
   * it is used to draw the bidirectional annotation in each
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
    let renderStatus = true;
    const { viewport } = enabledElement;
    const { element } = viewport;
    let annotations = getAnnotations(viewport.element, this.getToolName());

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

    for (let i = 0; i < annotations.length; i++) {
      const annotation = annotations[i] as BidirectionalAnnotation;
      const { annotationUID, data } = annotation;
      const { points, activeHandleIndex } = data.handles;
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      styleSpecifier.annotationUID = annotationUID;

      const lineWidth = this.getStyle('lineWidth', styleSpecifier, annotation);
      const lineDash = this.getStyle('lineDash', styleSpecifier, annotation);
      const color = this.getStyle('color', styleSpecifier, annotation);

      // If cachedStats does not exist, or the unit is missing (as part of import/hydration etc.),
      // force to recalculate the stats from the points
      if (
        !data.cachedStats[targetId] ||
        data.cachedStats[targetId].unit === undefined
      ) {
        data.cachedStats[targetId] = {
          length: null,
          width: null,
          unit: null,
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

      const lineUID = '0';
      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        lineUID,
        canvasCoordinates[0],
        canvasCoordinates[1],
        {
          color,
          lineDash,
          lineWidth,
        }
      );

      const secondLineUID = '1';
      drawLineSvg(
        svgDrawingHelper,
        annotationUID,
        secondLineUID,
        canvasCoordinates[2],
        canvasCoordinates[3],
        {
          color,
          lineDash,
          lineWidth,
        }
      );

      renderStatus = true;

      const textLines = this._getTextLines(data, targetId);

      if (!textLines || textLines.length === 0) {
        continue;
      }
      let canvasTextBoxCoords;

      if (!data.handles.textBox.hasMoved) {
        canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates);

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
        this.getLinkedTextBoxStyle(styleSpecifier, annotation)
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

  _movingLongAxisWouldPutItThroughShortAxis = (
    proposedFirstLineSegment,
    secondLineSegment
  ) => {
    const vectorInSecondLineDirection = vec2.create();

    vec2.set(
      vectorInSecondLineDirection,
      secondLineSegment.end.x - secondLineSegment.start.x,
      secondLineSegment.end.y - secondLineSegment.start.y
    );

    vec2.normalize(vectorInSecondLineDirection, vectorInSecondLineDirection);

    const extendedSecondLineSegment = {
      start: {
        x: secondLineSegment.start.x - vectorInSecondLineDirection[0] * 10,
        y: secondLineSegment.start.y - vectorInSecondLineDirection[1] * 10,
      },
      end: {
        x: secondLineSegment.end.x + vectorInSecondLineDirection[0] * 10,
        y: secondLineSegment.end.y + vectorInSecondLineDirection[1] * 10,
      },
    };

    // Add some buffer in the secondLineSegment when finding the proposedIntersectionPoint
    // Of points to stop us getting stack when rotating quickly.

    const proposedIntersectionPoint = lineSegment.intersectLine(
      [extendedSecondLineSegment.start.x, extendedSecondLineSegment.start.y],
      [extendedSecondLineSegment.end.x, extendedSecondLineSegment.end.y],
      [proposedFirstLineSegment.start.x, proposedFirstLineSegment.start.y],
      [proposedFirstLineSegment.end.x, proposedFirstLineSegment.end.y]
    );

    const wouldPutThroughShortAxis = !proposedIntersectionPoint;

    return wouldPutThroughShortAxis;
  };

  /**
   * get text box content
   */
  _getTextLines = (data, targetId) => {
    const { cachedStats } = data;
    const { length, width, unit } = cachedStats[targetId];

    if (length === undefined) {
      return;
    }

    // spaceBetweenSlices & pixelSpacing &
    // magnitude in each direction? Otherwise, this is "px"?
    const textLines = [
      `L: ${length.toFixed(2)} ${unit}`,
      `W: ${width.toFixed(2)} ${unit}`,
    ];

    return textLines;
  };

  _calculateLength(pos1, pos2) {
    const dx = pos1[0] - pos2[0];
    const dy = pos1[1] - pos2[1];
    const dz = pos1[2] - pos2[2];

    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  _calculateCachedStats = (annotation, renderingEngine, enabledElement) => {
    const { data } = annotation;
    const { viewportId, renderingEngineId } = enabledElement;

    const worldPos1 = data.handles.points[0];
    const worldPos2 = data.handles.points[1];
    const worldPos3 = data.handles.points[2];
    const worldPos4 = data.handles.points[3];

    const { cachedStats } = data;
    const targetIds = Object.keys(cachedStats);

    for (let i = 0; i < targetIds.length; i++) {
      const targetId = targetIds[i];

      const image = this.getTargetIdImage(targetId, renderingEngine);

      const { imageData, dimensions, hasPixelSpacing } = image;

      const dist1 = this._calculateLength(worldPos1, worldPos2);
      const dist2 = this._calculateLength(worldPos3, worldPos4);
      const length = dist1 > dist2 ? dist1 : dist2;
      const width = dist1 > dist2 ? dist2 : dist1;

      const index1 = transformWorldToIndex(imageData, worldPos1);
      const index2 = transformWorldToIndex(imageData, worldPos2);
      const index3 = transformWorldToIndex(imageData, worldPos3);
      const index4 = transformWorldToIndex(imageData, worldPos4);

      this._isInsideVolume(index1, index2, index3, index4, dimensions)
        ? (this.isHandleOutsideImage = false)
        : (this.isHandleOutsideImage = true);

      cachedStats[targetId] = {
        length,
        width,
        unit: hasPixelSpacing ? 'mm' : 'px',
      };
    }

    annotation.invalidated = false;

    // Dispatching annotation modified
    const eventType = Events.ANNOTATION_MODIFIED;

    const eventDetail: AnnotationModifiedEventDetail = {
      annotation,
      viewportId,
      renderingEngineId,
    };
    triggerEvent(eventTarget, eventType, eventDetail);

    return cachedStats;
  };

  _isInsideVolume = (index1, index2, index3, index4, dimensions): boolean => {
    return (
      csUtils.indexWithinDimensions(index1, dimensions) &&
      csUtils.indexWithinDimensions(index2, dimensions) &&
      csUtils.indexWithinDimensions(index3, dimensions) &&
      csUtils.indexWithinDimensions(index4, dimensions)
    );
  };
}
