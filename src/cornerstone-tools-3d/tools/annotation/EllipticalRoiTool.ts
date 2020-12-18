import { BaseAnnotationTool } from './../base/index';
// ~~ VTK Viewport
import { getEnabledElement, imageCache } from '../../../index';
import { getTargetVolume, getToolDataWithinSlice } from '../../util/planar';
import throttle from '../../util/throttle';
import { addToolState, getToolState } from '../../stateManagement/toolState';
import toolColors from '../../stateManagement/toolColors';
import toolStyle from '../../stateManagement/toolStyle';
import {
  draw,
  drawHandles,
  drawLinkedTextBox,
  drawEllipse,
  getNewContext,
} from '../../drawing';
import { vec2, vec3 } from 'gl-matrix';
import { state } from '../../store';
import { VtkjsToolEvents as EVENTS } from '../../enums';
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters';
import { indexWithinDimensions } from '../../util/vtkjs';
import { getTextBoxCoordsCanvas } from '../../util/drawing';
import { pointInEllipse } from '../../util/math/ellipse';
import getWorldWidthAndHeightInPlane from '../../util/planar/getWorldWidthAndHeightInPlane';
import { showToolCursor, hideToolCursor } from '../../store/toolCursor';

export default class EllipticalRoiTool extends BaseAnnotationTool {
  touchDragCallback: Function;
  mouseDragCallback: Function;
  _throttledCalculateCachedStats: Function;
  editData: {
    toolData: any;
    viewportUIDsToRender: Array<string>;
    handleIndex?: number;
    movingTextBox?: boolean;
    centerCanvas?: Array<number>;
    canvasWidth?: number;
    canvasHeight?: number;
    originalHandleCanvas?: Array<number>;
  } | null;
  name: string;
  _configuration: any;

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'EllipticalRoi',
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
    const canvasPos = currentPoints.canvas;

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
          textBox: {
            hasMoved: false,
            worldPosition: [0, 0, 0],
          },
          points: [[...worldPos], [...worldPos], [...worldPos], [...worldPos]],
          activeHandleIndex: null,
        },
        isDrawing: true,
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
      centerCanvas: canvasPos,
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

    const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));
    const canvasCorners = this._getCanvasEllipseCorners(canvasCoordinates);

    const [canvasPoint1, canvasPoint2] = canvasCorners;

    const minorEllipse = {
      left: Math.min(canvasPoint1[0], canvasPoint2[0]) + proximity / 2,
      top: Math.min(canvasPoint1[1], canvasPoint2[1]) + proximity / 2,
      width: Math.abs(canvasPoint1[0] - canvasPoint2[0]) - proximity,
      height: Math.abs(canvasPoint1[1] - canvasPoint2[1]) - proximity,
    };

    const majorEllipse = {
      left: Math.min(canvasPoint1[0], canvasPoint2[0]) - proximity / 2,
      top: Math.min(canvasPoint1[1], canvasPoint2[1]) - proximity / 2,
      width: Math.abs(canvasPoint1[0] - canvasPoint2[0]) + proximity,
      height: Math.abs(canvasPoint1[1] - canvasPoint2[1]) + proximity,
    };

    const pointInMinorEllipse = pointInEllipse(minorEllipse, canvasCoords);
    const pointInMajorEllipse = pointInEllipse(majorEllipse, canvasCoords);

    if (pointInMajorEllipse && !pointInMinorEllipse) {
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

    hideToolCursor(element);

    this._activateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);

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

    let centerCanvas;
    let canvasWidth;
    let canvasHeight;
    let originalHandleCanvas;

    if (handle.worldPosition) {
      movingTextBox = true;
    } else {
      const { points } = data.handles;
      const enabledElement = getEnabledElement(element);
      const { worldToCanvas } = enabledElement.viewport;

      handleIndex = points.findIndex((p) => p === handle);

      const pointsCanvas = points.map(worldToCanvas);

      originalHandleCanvas = pointsCanvas[handleIndex];

      canvasWidth = Math.abs(pointsCanvas[2][0] - pointsCanvas[3][0]);
      canvasHeight = Math.abs(pointsCanvas[0][1] - pointsCanvas[1][1]);

      centerCanvas = [
        (pointsCanvas[2][0] + pointsCanvas[3][0]) / 2,
        (pointsCanvas[0][1] + pointsCanvas[1][1]) / 2,
      ];
    }

    // Find viewports to render on drag.
    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    );

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex,
      canvasWidth,
      canvasHeight,
      centerCanvas,
      originalHandleCanvas,
      movingTextBox,
    };
    this._activateModify(element);

    hideToolCursor(element);

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

    delete data.isDrawing;

    delete data.isDrawing;

    this._deactivateModify(element);
    this._deactivateDraw(element);

    showToolCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    this.editData = null;

    renderingEngine.renderViewports(viewportUIDsToRender);
  };

  _mouseDragDrawCallback = (evt) => {
    const eventData = evt.detail;
    const { element } = eventData;
    const { currentPoints } = eventData;
    const currentCanvasPoints = currentPoints.canvas;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;
    const { canvasToWorld } = viewport;

    const { toolData, viewportUIDsToRender, centerCanvas } = this.editData;
    const { data } = toolData;

    const dX = Math.abs(currentCanvasPoints[0] - centerCanvas[0]);
    const dY = Math.abs(currentCanvasPoints[1] - centerCanvas[1]);

    const bottomCanvas = [centerCanvas[0], centerCanvas[1] - dY];
    const topCanvas = [centerCanvas[0], centerCanvas[1] + dY];
    const leftCanvas = [centerCanvas[0] - dX, centerCanvas[1]];
    const rightCanvas = [centerCanvas[0] + dX, centerCanvas[1]];

    data.handles.points = [
      canvasToWorld(bottomCanvas),
      canvasToWorld(topCanvas),
      canvasToWorld(leftCanvas),
      canvasToWorld(rightCanvas),
    ];

    data.invalidated = true;

    renderingEngine.renderViewports(viewportUIDsToRender);
  };

  _mouseDragModifyCallback = (evt) => {
    const eventData = evt.detail;
    const { element } = eventData;

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
      this._dragHandle(evt);
    }

    data.invalidated = true;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);
  };

  _dragHandle = (evt) => {
    const eventData = evt.detail;
    const { element } = eventData;
    const enabledElement = getEnabledElement(element);
    const { canvasToWorld } = enabledElement.viewport;

    const {
      toolData,
      canvasWidth,
      canvasHeight,
      handleIndex,
      centerCanvas,
      originalHandleCanvas,
    } = this.editData;
    const { data } = toolData;
    const { points } = data.handles;

    // Move current point in that direction.
    // Move other points in oposite direction.

    const { currentPoints } = eventData;
    const currentCanvasPoints = currentPoints.canvas;

    if (handleIndex === 0 || handleIndex == 1) {
      // Dragging top or bottom point
      const dYCanvas = Math.abs(currentCanvasPoints[1] - centerCanvas[1]);

      const canvasBottom = [centerCanvas[0], centerCanvas[1] - dYCanvas];
      const canvasTop = [centerCanvas[0], centerCanvas[1] + dYCanvas];

      points[0] = canvasToWorld(canvasBottom);
      points[1] = canvasToWorld(canvasTop);

      const dXCanvas = currentCanvasPoints[0] - originalHandleCanvas[0];
      const newHalfCanvasWidth = canvasWidth / 2 + dXCanvas;

      const canvasLeft = [
        centerCanvas[0] - newHalfCanvasWidth,
        centerCanvas[1],
      ];
      const canvasRight = [
        centerCanvas[0] + newHalfCanvasWidth,
        centerCanvas[1],
      ];

      points[2] = canvasToWorld(canvasLeft);
      points[3] = canvasToWorld(canvasRight);
    } else {
      // Dragging left or right point
      const dXCanvas = Math.abs(currentCanvasPoints[0] - centerCanvas[0]);

      const canvasLeft = [centerCanvas[0] - dXCanvas, centerCanvas[1]];
      const canvasRight = [centerCanvas[0] + dXCanvas, centerCanvas[1]];

      points[2] = canvasToWorld(canvasLeft);
      points[3] = canvasToWorld(canvasRight);

      const dYCanvas = currentCanvasPoints[1] - originalHandleCanvas[1];
      const newHalfCanvasHeight = canvasHeight / 2 + dYCanvas;

      const canvasBottom = [
        centerCanvas[0],
        centerCanvas[1] - newHalfCanvasHeight,
      ];
      const canvasTop = [
        centerCanvas[0],
        centerCanvas[1] + newHalfCanvasHeight,
      ];

      points[0] = canvasToWorld(canvasBottom);
      points[1] = canvasToWorld(canvasTop);
    }
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
    const { viewport, scene } = enabledElement;
    const targetVolumeUID = this._getTargetVolumeUID(scene);

    const context = getNewContext(element);
    const lineWidth = toolStyle.getToolWidth();

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i];
      const data = toolData.data;

      const color = toolColors.getColorIfActive(data);
      const { handles, isDrawing } = data;
      const { points, activeHandleIndex } = handles;

      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));
      const canvasCorners = this._getCanvasEllipseCorners(canvasCoordinates);

      if (!data.cachedStats[targetVolumeUID]) {
        data.cachedStats[targetVolumeUID] = {};

        this._calculateCachedStats(data, viewport, canvasCorners);
      } else if (data.invalidated) {
        this._throttledCalculateCachedStats(data, viewport, canvasCorners);
      }

      const textLines = this._getTextLines(data, targetVolumeUID);

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

        drawEllipse(context, canvasCorners[0], canvasCorners[1], {
          color,
        });

        if (!isDrawing && textLines) {
          let canvasTextBoxCoords;

          if (!data.handles.textBox.hasMoved) {
            canvasTextBoxCoords = getTextBoxCoordsCanvas(canvasCorners);

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

  _getCanvasEllipseCorners = (canvasCoordinates) => {
    const [bottom, top, left, right] = canvasCoordinates;

    const topLeft = [left[0], top[1]];
    const bottomRight = [right[0], bottom[1]];

    return [topLeft, bottomRight];
  };

  _getTextLines = (data, targetVolumeUID) => {
    const cachedVolumeStats = data.cachedStats[targetVolumeUID];
    const { area, mean, stdDev, Modality } = cachedVolumeStats;

    if (mean === undefined) {
      return;
    }

    const textLines = [];

    let areaLine = `Area: ${area.toFixed(2)} mm${String.fromCharCode(178)}`;
    let meanLine = `Mean: ${mean.toFixed(2)}`;
    let stdDevLine = `Std Dev: ${stdDev.toFixed(2)}`;

    if (Modality === 'PT') {
      meanLine += ' SUV';
      stdDevLine += ' SUV';
    } else if (Modality === 'CT') {
      meanLine += ' HU';
      stdDevLine += ' HU';
    } else {
      meanLine += ' MO';
      stdDevLine += ' MO';
    }

    textLines.push(areaLine);
    textLines.push(meanLine);
    textLines.push(stdDevLine);

    return textLines;
  };

  _calculateCachedStats = (data, viewport, canvasCorners) => {
    const [canvasPoint1, canvasPoint2] = canvasCorners;
    const worldPos1 = viewport.canvasToWorld(canvasPoint1);
    const worldPos2 = viewport.canvasToWorld(canvasPoint2);

    const { viewPlaneNormal, viewUp } = viewport.getCamera();

    const { cachedStats } = data;

    const ellipse = {
      left: Math.min(canvasPoint1[0], canvasPoint2[0]),
      top: Math.min(canvasPoint1[1], canvasPoint2[1]),
      width: Math.abs(canvasPoint1[0] - canvasPoint2[0]),
      height: Math.abs(canvasPoint1[1] - canvasPoint2[1]),
    };

    const volumeUIDs = Object.keys(cachedStats);

    for (let i = 0; i < volumeUIDs.length; i++) {
      const volumeUID = volumeUIDs[i];
      const imageVolume = imageCache.getImageVolume(volumeUID);

      const {
        dimensions,
        scalarData,
        vtkImageData: imageData,
        metadata,
      } = imageVolume;
      const worldPos1Index = [0, 0, 0];
      const worldPos2Index = [0, 0, 0];

      imageData.worldToIndexVec3(worldPos1, worldPos1Index);

      worldPos1Index[0] = Math.floor(worldPos1Index[0]);
      worldPos1Index[1] = Math.floor(worldPos1Index[1]);
      worldPos1Index[2] = Math.floor(worldPos1Index[2]);

      imageData.worldToIndexVec3(worldPos2, worldPos2Index);

      worldPos2Index[0] = Math.floor(worldPos2Index[0]);
      worldPos2Index[1] = Math.floor(worldPos2Index[1]);
      worldPos2Index[2] = Math.floor(worldPos2Index[2]);

      // Check if one of the indexes are inside the volume, this then gives us
      // Some area to do stats over.

      if (this._isInsideVolume(worldPos1Index, worldPos2Index, dimensions)) {
        const iMin = Math.min(worldPos1Index[0], worldPos2Index[0]);
        const iMax = Math.max(worldPos1Index[0], worldPos2Index[0]);

        const jMin = Math.min(worldPos1Index[1], worldPos2Index[1]);
        const jMax = Math.max(worldPos1Index[1], worldPos2Index[1]);

        const kMin = Math.min(worldPos1Index[2], worldPos2Index[2]);
        const kMax = Math.max(worldPos1Index[2], worldPos2Index[2]);

        const { worldWidth, worldHeight } = getWorldWidthAndHeightInPlane(
          viewPlaneNormal,
          viewUp,
          imageVolume,
          worldPos1,
          worldPos2
        );

        const area = Math.PI * (worldWidth / 2) * (worldHeight / 2);

        let count = 0;
        let mean = 0;
        let stdDev = 0;

        const yMultiple = dimensions[0];
        const zMultiple = dimensions[0] * dimensions[1];

        // Calling worldToCanvas on voxels all the time is super slow,
        // So we instead work out the change in canvas position incrementing each index causes.
        const start = [iMin, jMin, kMin];

        const worldPosStart = vec3.create();
        imageData.indexToWorldVec3(start, worldPosStart);
        const canvasPosStart = viewport.worldToCanvas(worldPosStart);

        const startPlusI = [iMin + 1, jMin, kMin];
        const startPlusJ = [iMin, jMin + 1, kMin];
        const startPlusK = [iMin, jMin, kMin + 1];

        const worldPosStartPlusI = vec3.create();
        const plusICanvasDelta = vec2.create();
        imageData.indexToWorldVec3(startPlusI, worldPosStartPlusI);
        const canvasPosStartPlusI = viewport.worldToCanvas(worldPosStartPlusI);
        vec2.sub(plusICanvasDelta, canvasPosStartPlusI, canvasPosStart);

        const worldPosStartPlusJ = vec3.create();
        const plusJCanvasDelta = vec2.create();
        imageData.indexToWorldVec3(startPlusJ, worldPosStartPlusJ);
        const canvasPosStartPlusJ = viewport.worldToCanvas(worldPosStartPlusJ);
        vec2.sub(plusJCanvasDelta, canvasPosStartPlusJ, canvasPosStart);

        const worldPosStartPlusK = vec3.create();
        const plusKCanvasDelta = vec2.create();
        imageData.indexToWorldVec3(startPlusK, worldPosStartPlusK);
        const canvasPosStartPlusK = viewport.worldToCanvas(worldPosStartPlusK);
        vec2.sub(plusKCanvasDelta, canvasPosStartPlusK, canvasPosStart);

        // This is a tripple loop, but one of these 3 values will be constant
        // In the planar view.
        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const dI = i - iMin;
              const dJ = j - jMin;
              const dK = k - kMin;

              let canvasCoords = [...canvasPosStart];

              canvasCoords = [
                canvasCoords[0] +
                  plusICanvasDelta[0] * dI +
                  plusJCanvasDelta[0] * dJ +
                  plusKCanvasDelta[0] * dK,
                canvasCoords[1] +
                  plusICanvasDelta[1] * dI +
                  plusJCanvasDelta[1] * dJ +
                  plusKCanvasDelta[1] * dK,
              ];

              if (pointInEllipse(ellipse, canvasCoords)) {
                const value = scalarData[k * zMultiple + j * yMultiple + i];

                count++;
                mean += value;
              }
            }
          }
        }

        mean /= count;

        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const value = scalarData[k * zMultiple + j * yMultiple + i];

              const valueMinusMean = value - mean;

              stdDev += valueMinusMean * valueMinusMean;
            }
          }
        }

        stdDev /= count;
        stdDev = Math.sqrt(stdDev);

        cachedStats[volumeUID] = {
          Modality: metadata.Modality,
          area,
          mean,
          stdDev,
        };
      } else {
        cachedStats[volumeUID] = {
          Modality: metadata.Modality,
        };
      }
    }

    data.invalidated = false;

    return cachedStats;
  };

  _isInsideVolume = (index1, index2, dimensions) => {
    return (
      indexWithinDimensions(index1, dimensions) &&
      indexWithinDimensions(index2, dimensions)
    );
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
