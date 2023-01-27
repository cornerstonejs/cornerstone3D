import { vec2, vec3, mat2, mat3, mat2d } from 'gl-matrix';
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
class BidirectionalTool extends AnnotationTool {
  static toolName;

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
    evt: EventTypes.InteractionEventType
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
    evt: EventTypes.InteractionEventType,
    annotation: BidirectionalAnnotation
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
    evt: EventTypes.InteractionEventType,
    annotation: BidirectionalAnnotation,
    handle: ToolHandle
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
  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;

    const { annotation, viewportIdsToRender, newAnnotation, hasMoved } =
      this.editData;
    const { data } = annotation;

    if (newAnnotation && !hasMoved) {
      return;
    }

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
  _dragDrawCallback = (evt: EventTypes.InteractionEventType): void => {
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
    // short axis is perpendicular to long axis, and we set its length to be 2/3 of long axis
    // (meaning each)
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
  _dragModifyCallback = (evt: EventTypes.InteractionEventType): void => {
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
      this._dragModifyHandle(evt);
      annotation.invalidated = true;
    }

    triggerAnnotationRenderForViewportIds(renderingEngine, viewportIdsToRender);
  };

  /**
   * Mouse dragging a handle callback
   * @param evt - mouse drag event
   */
  _dragModifyHandle = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { currentPoints, element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { annotation, handleIndex: movingHandleIndex } = this.editData;
    const { data } = annotation;

    // Moving handle
    const worldPos = currentPoints.world;
    const canvasCoordHandlesCurrent = [
      viewport.worldToCanvas(data.handles.points[0]),
      viewport.worldToCanvas(data.handles.points[1]),
      viewport.worldToCanvas(data.handles.points[2]),
      viewport.worldToCanvas(data.handles.points[3]),
    ];

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

    if (movingHandleIndex === 0 || movingHandleIndex === 1) {
      const fixedHandleIndex = movingHandleIndex === 0 ? 1 : 0;

      const fixedHandleCanvasCoord =
        canvasCoordHandlesCurrent[fixedHandleIndex];

      const fixedHandleToProposedCoordVec = vec2.set(
        vec2.create(),
        proposedCanvasCoord[0] - fixedHandleCanvasCoord[0],
        proposedCanvasCoord[1] - fixedHandleCanvasCoord[1]
      );

      const fixedHandleToOldCoordVec = vec2.set(
        vec2.create(),
        canvasCoordHandlesCurrent[movingHandleIndex][0] -
          fixedHandleCanvasCoord[0],
        canvasCoordHandlesCurrent[movingHandleIndex][1] -
          fixedHandleCanvasCoord[1]
      );

      // normalize vector
      vec2.normalize(
        fixedHandleToProposedCoordVec,
        fixedHandleToProposedCoordVec
      );
      vec2.normalize(fixedHandleToOldCoordVec, fixedHandleToOldCoordVec);

      // Check whether this
      const proposedFirstLineSegment = {
        start: {
          x: fixedHandleCanvasCoord[0],
          y: fixedHandleCanvasCoord[1],
        },
        end: {
          x: proposedCanvasCoord[0],
          y: proposedCanvasCoord[1],
        },
      };

      // Note: this is the case when we are modifying the long axis line segment
      // and we make it shorter and shorter until its second half size becomes zero
      // which basically means that any more modification would make the long axis
      // second half disappear. In this case, we just bail out and do not update
      // since we don't want to disrupt the bidirectional shape.
      if (
        this._movingLongAxisWouldPutItThroughShortAxis(
          proposedFirstLineSegment,
          secondLineSegment
        )
      ) {
        return;
      }

      const centerOfRotation = fixedHandleCanvasCoord;

      const angle = this._getSignedAngle(
        fixedHandleToOldCoordVec,
        fixedHandleToProposedCoordVec
      );

      // rotate handles around the center of rotation, first translate to origin,
      // then rotate, then translate back
      let firstPointX = canvasCoordHandlesCurrent[2][0];
      let firstPointY = canvasCoordHandlesCurrent[2][1];

      let secondPointX = canvasCoordHandlesCurrent[3][0];
      let secondPointY = canvasCoordHandlesCurrent[3][1];

      // translate to origin
      firstPointX -= centerOfRotation[0];
      firstPointY -= centerOfRotation[1];

      secondPointX -= centerOfRotation[0];
      secondPointY -= centerOfRotation[1];

      // rotate
      const rotatedFirstPoint =
        firstPointX * Math.cos(angle) - firstPointY * Math.sin(angle);
      const rotatedFirstPointY =
        firstPointX * Math.sin(angle) + firstPointY * Math.cos(angle);

      const rotatedSecondPoint =
        secondPointX * Math.cos(angle) - secondPointY * Math.sin(angle);
      const rotatedSecondPointY =
        secondPointX * Math.sin(angle) + secondPointY * Math.cos(angle);

      // translate back
      firstPointX = rotatedFirstPoint + centerOfRotation[0];
      firstPointY = rotatedFirstPointY + centerOfRotation[1];

      secondPointX = rotatedSecondPoint + centerOfRotation[0];
      secondPointY = rotatedSecondPointY + centerOfRotation[1];

      // update handles
      const newFirstPoint = viewport.canvasToWorld([firstPointX, firstPointY]);
      const newSecondPoint = viewport.canvasToWorld([
        secondPointX,
        secondPointY,
      ]);

      // the fixed handle is the one that is not being moved so we
      // don't need to update it
      data.handles.points[movingHandleIndex] = proposedPoint;
      data.handles.points[2] = newFirstPoint;
      data.handles.points[3] = newSecondPoint;
    } else {
      // Translation manipulator
      const translateHandleIndex = movingHandleIndex === 2 ? 3 : 2;

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

      const longLineSegmentVec = vec2.subtract(
        vec2.create(),
        [
          canvasCoordsCurrent.longLineSegment.end.x,
          canvasCoordsCurrent.longLineSegment.end.y,
        ],
        [
          canvasCoordsCurrent.longLineSegment.start.x,
          canvasCoordsCurrent.longLineSegment.start.y,
        ]
      );

      const longLineSegmentVecNormalized = vec2.normalize(
        vec2.create(),
        longLineSegmentVec
      );

      const proposedToCurrentVec = vec2.subtract(
        vec2.create(),
        [proposedCanvasCoord[0], proposedCanvasCoord[1]],
        [
          canvasCoordHandlesCurrent[movingHandleIndex][0],
          canvasCoordHandlesCurrent[movingHandleIndex][1],
        ]
      );

      const movementLength = vec2.length(proposedToCurrentVec);

      const angle = this._getSignedAngle(
        longLineSegmentVecNormalized,
        proposedToCurrentVec
      );

      const movementAlongLineSegmentLength = Math.cos(angle) * movementLength;

      const newTranslatedPoint = vec2.scaleAndAdd(
        vec2.create(),
        [
          canvasCoordHandlesCurrent[translateHandleIndex][0],
          canvasCoordHandlesCurrent[translateHandleIndex][1],
        ],
        longLineSegmentVecNormalized,
        movementAlongLineSegmentLength
      );

      // don't update if it passes through the other line segment
      if (
        this._movingLongAxisWouldPutItThroughShortAxis(
          {
            start: {
              x: proposedCanvasCoord[0],
              y: proposedCanvasCoord[1],
            },
            end: {
              x: newTranslatedPoint[0],
              y: newTranslatedPoint[1],
            },
          },
          {
            start: {
              x: canvasCoordsCurrent.longLineSegment.start.x,
              y: canvasCoordsCurrent.longLineSegment.start.y,
            },
            end: {
              x: canvasCoordsCurrent.longLineSegment.end.x,
              y: canvasCoordsCurrent.longLineSegment.end.y,
            },
          }
        )
      ) {
        return;
      }

      const intersectionPoint = lineSegment.intersectLine(
        [proposedCanvasCoord[0], proposedCanvasCoord[1]],
        [newTranslatedPoint[0], newTranslatedPoint[1]],
        [firstLineSegment.start.x, firstLineSegment.start.y],
        [firstLineSegment.end.x, firstLineSegment.end.y]
      );

      // don't update if it doesn't intersect
      if (!intersectionPoint) {
        return;
      }

      data.handles.points[translateHandleIndex] = viewport.canvasToWorld(
        newTranslatedPoint as Types.Point2
      );
      data.handles.points[movingHandleIndex] = proposedPoint;
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

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragDrawCallback);
    element.addEventListener(Events.MOUSE_MOVE, this._dragDrawCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

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
      this._dragDrawCallback as EventListener
    );
  };

  _deactivateDraw = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragDrawCallback);
    element.removeEventListener(Events.MOUSE_MOVE, this._dragDrawCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

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
      this._dragDrawCallback as EventListener
    );
  };

  _activateModify = (element) => {
    state.isInteractingWithTool = true;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_DRAG,
      this._dragModifyCallback as EventListener
    );
    element.addEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
  };

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragModifyCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(
      Events.TOUCH_END,
      this._endCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_DRAG,
      this._dragModifyCallback as EventListener
    );
    element.removeEventListener(
      Events.TOUCH_TAP,
      this._endCallback as EventListener
    );
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
      const shadow = this.getStyle('shadow', styleSpecifier, annotation);

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

      const dataId1 = `${annotationUID}-line-1`;
      const dataId2 = `${annotationUID}-line-2`;

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
          shadow,
        },
        dataId1
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
          shadow,
        },
        dataId2
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
    firstLineSegment,
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
      [firstLineSegment.start.x, firstLineSegment.start.y],
      [firstLineSegment.end.x, firstLineSegment.end.y]
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

      // If image does not exists for the targetId, skip. This can be due
      // to various reasons such as if the target was a volumeViewport, and
      // the volumeViewport has been decached in the meantime.
      if (!image) {
        continue;
      }

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

  _getSignedAngle = (vector1, vector2) => {
    return Math.atan2(
      vector1[0] * vector2[1] - vector1[1] * vector2[0],
      vector1[0] * vector2[0] + vector1[1] * vector2[1]
    );
  };
}

BidirectionalTool.toolName = 'Bidirectional';
export default BidirectionalTool;
