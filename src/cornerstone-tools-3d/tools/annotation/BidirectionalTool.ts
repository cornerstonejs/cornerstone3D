import { BaseAnnotationTool } from './../base/index';
import * as vtkMath from 'vtk.js/Sources/Common/Core/Math';
// ~~ VTK Viewport
import { getEnabledElement, imageCache } from '../../../index';
import uuidv4 from '../../util/uuidv4.js';
import { getTargetVolume, getToolDataWithinSlice } from '../../util/planar';
import throttle from '../../util/throttle';
import { addToolState, getToolState } from '../../stateManagement/toolState';
import toolColors from '../../stateManagement/toolColors';
import toolStyle from '../../stateManagement/toolStyle';
import {
  draw,
  drawHandles,
  drawLinkedTextBox,
  drawLine,
  getNewContext,
} from '../../drawing';
import { vec2, vec3 } from 'gl-matrix';
import { state } from '../../store';
import { VtkjsToolEvents as EVENTS } from '../../enums';
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters';
import { indexWithinDimensions } from '../../util/vtkjs';
import cornerstoneMath from 'cornerstone-math/dist/cornerstoneMath.js';
import getTextBoxCoordsCanvas from '../../util/getTextBoxCoordsCanvas';
import { showToolCursor, hideToolCursor } from '../../store/toolCursor';

export default class BidirectionalTool extends BaseAnnotationTool {
  touchDragCallback: Function;
  mouseDragCallback: Function;
  _throttledCalculateCachedStats: Function;
  editData: {
    toolData: any;
    viewportUIDsToRender: [];
    handleIndex?: number;
    movingTextBox: boolean;
  } | null;
  name: string;
  _configuration: any;

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'Bidirectional',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    });

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    );
  }

  addNewMeasurement = (evt, interactionType) => {
    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const worldPos = currentPoints.world;
    const enabledElement = getEnabledElement(element);
    const { viewport, FrameOfReferenceUID, renderingEngine } = enabledElement;

    if (!FrameOfReferenceUID) {
      console.warn('No FrameOfReferenceUID, empty scene, exiting early.');

      return;
    }

    const camera = viewport.getCamera();
    const { viewPlaneNormal } = camera;
    const toolData = {
      metadata: {
        viewPlaneNormal: [...viewPlaneNormal],
        FrameOfReferenceUID,
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: {
          points: [
            // long
            [...worldPos],
            [...worldPos],
            // short
            [...worldPos],
            [...worldPos],
          ],
          textBox: {
            hasMoved: false,
            worldPosition: [0, 0, 0],
          },
          activeHandleIndex: null,
        },
        cachedStats: {},
        active: true,
      },
    };

    addToolState(element, toolData);

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    );

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex: 1,
      movingTextBox: false,
    };
    this._activateDraw(element);

    hideToolCursor(element);

    evt.preventDefault();

    renderingEngine.renderViewports(viewportUIDsToRender);
  };

  getHandleNearImagePoint = (element, toolData, canvasCoords, proximity) => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = toolData;
    const { points, textBox } = data.handles;
    const { worldBoundingBox } = textBox;

    if (worldBoundingBox) {
      const canvasBoundingBox = {
        topLeft: viewport.worldToCanvas(worldBoundingBox.topLeft),
        topRight: viewport.worldToCanvas(worldBoundingBox.topRight),
        bottomLeft: viewport.worldToCanvas(worldBoundingBox.bottomLeft),
        bottmRight: viewport.worldToCanvas(worldBoundingBox.bottomRight),
      };

      if (
        canvasCoords[0] >= canvasBoundingBox.topLeft[0] &&
        canvasCoords[0] <= canvasBoundingBox.bottmRight[0] &&
        canvasCoords[1] >= canvasBoundingBox.topLeft[1] &&
        canvasCoords[1] <= canvasBoundingBox.bottmRight[1]
      ) {
        data.handles.activeHandleIndex = null;
        return textBox;
      }
    }

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const toolDataCanvasCoordinate = viewport.worldToCanvas(point);

      const near =
        vec2.distance(canvasCoords, toolDataCanvasCoordinate) < proximity;

      if (near === true) {
        data.handles.activeHandleIndex = i;
        return point;
      }
    }

    data.handles.activeHandleIndex = null;
  };

  pointNearTool = (element, toolData, canvasCoords, proximity) => {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { data } = toolData;
    const { points } = data.handles;

    // Check long axis
    let canavasPoint1 = viewport.worldToCanvas(points[0]);
    let canavasPoint2 = viewport.worldToCanvas(points[1]);

    let lineSegment = {
      start: {
        x: canavasPoint1[0],
        y: canavasPoint1[1],
      },
      end: {
        x: canavasPoint2[0],
        y: canavasPoint2[1],
      },
    };

    let distanceToPoint = cornerstoneMath.lineSegment.distanceToPoint(
      lineSegment,
      {
        x: canvasCoords[0],
        y: canvasCoords[1],
      }
    );

    if (distanceToPoint <= proximity) {
      return true;
    }

    // Check short axis
    canavasPoint1 = viewport.worldToCanvas(points[2]);
    canavasPoint2 = viewport.worldToCanvas(points[3]);

    lineSegment = {
      start: {
        x: canavasPoint1[0],
        y: canavasPoint1[1],
      },
      end: {
        x: canavasPoint2[0],
        y: canavasPoint2[1],
      },
    };

    distanceToPoint = cornerstoneMath.lineSegment.distanceToPoint(lineSegment, {
      x: canvasCoords[0],
      y: canvasCoords[1],
    });

    if (distanceToPoint <= proximity) {
      return true;
    }
  };

  toolSelectedCallback = (evt, toolData, interactionType = 'mouse') => {
    const eventData = evt.detail;
    const { element } = eventData;

    const { data } = toolData;

    data.active = true;

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    );

    this.editData = {
      toolData,
      viewportUIDsToRender,
      movingTextBox: false,
    };

    this._activateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);

    hideToolCursor(element);

    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt,
    toolData,
    handle,
    interactionType = 'mouse'
  ) => {
    const eventData = evt.detail;
    const { element } = eventData;
    const { data } = toolData;

    data.active = true;

    let movingTextBox = false;
    let handleIndex;

    if (handle.worldPosition) {
      movingTextBox = true;
    } else {
      handleIndex = data.handles.points.findIndex((p) => p === handle);
    }

    // Find viewports to render on drag.
    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    );

    hideToolCursor(element);

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex,
      movingTextBox,
    };
    this._activateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);

    evt.preventDefault();
  };

  _mouseUpCallback = (evt) => {
    const eventData = evt.detail;
    const { element } = eventData;

    const { toolData, viewportUIDsToRender } = this.editData;
    const { data } = toolData;

    data.active = false;
    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);

    showToolCursor(element);

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

    this.editData = null;

    renderingEngine.renderViewports(viewportUIDsToRender);
  };

  _mouseDragDrawCallback = (evt) => {
    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;
    const { worldToCanvas } = viewport;
    const { toolData, viewportUIDsToRender, handleIndex } = this.editData;
    const { data } = toolData;

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

    data.invalidated = true;
    renderingEngine.renderViewports(viewportUIDsToRender);
  };

  _mouseDragModifyCallback = (evt) => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;
    const {
      toolData,
      viewportUIDsToRender,
      handleIndex,
      movingTextBox,
    } = this.editData;
    const { data } = toolData;
    if (movingTextBox) {
      const { deltaPoints } = eventData;
      const worldPosDelta = deltaPoints.world;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
      // Moving tool
      const { deltaPoints } = eventData;
      const worldPosDelta = deltaPoints.world;
      const points = data.handles.points;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
    } else {
      this._mouseDragModifyHandle(evt);
    }

    data.invalidated = true;
    renderingEngine.renderViewports(viewportUIDsToRender);
  };

  _mouseDragModifyHandle = (evt) => {
    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const { toolData, handleIndex } = this.editData;
    const { data } = toolData;

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
    let proposedPoint = [...worldPos];
    let proposedCanvasCoord = viewport.worldToCanvas(proposedPoint);

    if (handleIndex === 0 || handleIndex === 1) {
      let fixedHandleIndex = handleIndex === 0 ? 1 : 0;

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
      const intersectionPoint = cornerstoneMath.lineSegment.intersectLine(
        secondLineSegment,
        firstLineSegment
      );

      const intersectionCoord = vec2.create();

      vec2.set(intersectionCoord, intersectionPoint.x, intersectionPoint.y);

      // 1. distance from intersection point to start handle?
      const distFromLeftHandle = vec2.distance(
        canvasCoordHandlesCurrent[2],
        intersectionCoord
      );

      // 2. distance from intersection point to end handle?
      const distFromRightHandle = vec2.distance(
        canvasCoordHandlesCurrent[3],
        intersectionCoord
      );

      // 3. distance from long's opposite handle and intersect point
      // Need new intersect x/y
      const distIntersectAndFixedPoint = Math.abs(
        vec2.distance(fixedCanvasCoord, intersectionCoord)
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
      let translateHandleIndex = handleIndex === 2 ? 3 : 2;

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
      const newIntersectionPoint = cornerstoneMath.lineSegment.intersectLine(
        canvasCoordsCurrent.longLineSegment,
        helperLine
      );

      // short-circuit
      if (newIntersectionPoint === undefined) {
        return;
      }

      // 1. distance from intersection point to start handle?
      const distFromTranslateHandle = vec2.distance(
        canvasCoordHandlesCurrent[translateHandleIndex],
        [newIntersectionPoint.x, newIntersectionPoint.y]
      );

      // isStart if index is 0 or 2
      const shortLineSegment = {
        start: {
          x: newIntersectionPoint.x + vectorY * distFromTranslateHandle,
          y: newIntersectionPoint.y + vectorX * distFromTranslateHandle * -1,
        },
        end: {
          x: newIntersectionPoint.x + vectorY * distFromTranslateHandle * -1,
          y: newIntersectionPoint.y + vectorX * distFromTranslateHandle,
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

    const proposedIntersectionPoint = cornerstoneMath.lineSegment.intersectLine(
      extendedSecondLineSegment,
      proposedFirstLineSegment
    );

    const wouldPutThroughShortAxis = !proposedIntersectionPoint;

    return wouldPutThroughShortAxis;
  };

  _activateDraw = (element) => {
    state.isToolLocked = true;

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragDrawCallback);
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback);

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback);
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragDrawCallback);
  };

  _deactivateDraw = (element) => {
    state.isToolLocked = false;

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragDrawCallback);
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback);

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback);
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragDrawCallback);
  };

  _activateModify = (element) => {
    state.isToolLocked = true;

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragModifyCallback);
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback);

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback);
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragModifyCallback);
  };

  _deactivateModify = (element) => {
    state.isToolLocked = false;

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(
      EVENTS.MOUSE_DRAG,
      this._mouseDragModifyCallback
    );
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback);

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback);
    element.removeEventListener(
      EVENTS.TOUCH_DRAG,
      this._mouseDragModifyCallback
    );
  };

  /**
   * getToolState = Custom getToolStateMethod with filtering.
   * @param element
   */
  filterInteractableToolStateForElement = (element, toolState) => {
    if (!toolState || !toolState.length) {
      return;
    }

    const enabledElement = getEnabledElement(element);
    const { viewport, scene } = enabledElement;
    const camera = viewport.getCamera();

    const { spacingInNormalDirection } = getTargetVolume(scene, camera);

    // Get data with same normal
    const toolDataWithinSlice = getToolDataWithinSlice(
      toolState,
      camera,
      spacingInNormalDirection
    );

    return toolDataWithinSlice;
  };

  renderToolData = (evt) => {
    const eventData = evt.detail;
    const { canvas: element } = eventData;

    let toolState = getToolState(element, this.name);

    if (!toolState) {
      return;
    }

    toolState = this.filterInteractableToolStateForElement(element, toolState);

    if (!toolState.length) {
      return;
    }

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const context = getNewContext(element);
    const lineWidth = toolStyle.getToolWidth();

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i];
      const data = toolData.data;
      const { points, activeHandleIndex } = data.handles;
      const color = toolColors.getColorIfActive(data);

      if (data.invalidated) {
        this._throttledCalculateCachedStats(data);
      }

      const textLines = this._getTextLines(data);
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      let activeHandleCanvasCoords;

      if (!this.editData && activeHandleIndex !== null) {
        // Not creating and hovering over handle, so render handle.

        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
      }

      draw(context, (context) => {
        if (activeHandleCanvasCoords) {
          drawHandles(context, activeHandleCanvasCoords, {
            color,
          });
        }
        drawLine(context, canvasCoordinates[0], canvasCoordinates[1], {
          color,
        });
        drawLine(context, canvasCoordinates[2], canvasCoordinates[3], {
          color,
        });

        if (textLines) {
          let canvasTextBoxCoords;

          if (!data.handles.textBox.hasMoved) {
            canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCoordinates);

            data.handles.textBox.worldPosition = viewport.canvasToWorld(
              canvasTextBoxCoords
            );
          } else {
            canvasTextBoxCoords = viewport.worldToCanvas(
              data.handles.textBox.worldPosition
            );
          }

          drawLinkedTextBox(
            context,
            canvasTextBoxCoords,
            textLines,
            data.handles.textBox,
            canvasCoordinates,
            viewport.canvasToWorld,
            color,
            lineWidth,
            10,
            true
          );
        }
      });
    }
  };

  _getTextLines = (data) => {
    const { cachedStats } = data;
    const { length, width } = cachedStats;

    if (length === undefined) {
      return;
    }

    // spaceBetweenSlices & pixelSpacing &
    // magnitude in each direction? Otherwise, this is "px"?
    const textLines = [
      `L: ${length.toFixed(2)} mm`,
      `W: ${width.toFixed(2)} mm`,
    ];

    return textLines;
  };

  _calculateCachedStats = (data) => {
    const worldPos1 = data.handles.points[0];
    const worldPos2 = data.handles.points[1];
    const worldPos3 = data.handles.points[2];
    const worldPos4 = data.handles.points[3];
    const { cachedStats } = data;

    // https://github.com/Kitware/vtk-js/blob/b50fd091cb9b5b65981bc7c64af45e8f2472d7a1/Sources/Common/Core/Math/index.js#L331
    const dist1 = Math.sqrt(
      vtkMath.distance2BetweenPoints(worldPos1, worldPos2)
    );
    const dist2 = Math.sqrt(
      vtkMath.distance2BetweenPoints(worldPos3, worldPos4)
    );
    const length = dist1 > dist2 ? dist1 : dist2;
    const width = dist1 > dist2 ? dist2 : dist1;

    data.cachedStats = {
      length,
      width,
    };

    data.invalidated = false;
  };

  _isInsideVolume = (index1, index2, dimensions) => {
    return (
      indexWithinDimensions(index1, dimensions) &&
      indexWithinDimensions(index2, dimensions)
    );
  };

  _clipIndexToVolume = (index, dimensions) => {
    for (let i = 0; i <= 2; i++) {
      if (index[i] < 0) {
        index[i] = 0;
      } else if (index[i] >= dimensions[i]) {
        index[i] = dimensions[i] - 1;
      }
    }
  };

  _getTargetVolumeUID = (scene) => {
    if (this._configuration.volumeUID) {
      return this._configuration.volumeUID;
    }

    const volumeActors = scene.getVolumeActors();

    if (!volumeActors && !volumeActors.length) {
      // No stack to scroll through
      return;
    }

    return volumeActors[0].uid;
  };
}
