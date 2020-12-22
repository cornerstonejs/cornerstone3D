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
  drawRect,
  getNewContext,
  setShadow,
} from '../../drawing';
import { vec2 } from 'gl-matrix';
import { state } from '../../store';
import { CornerstoneTools3DEvents as EVENTS } from '../../enums';
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters';
import cornerstoneMath from 'cornerstone-math';
import { getTextBoxCoordsCanvas } from '../../util/drawing';
import getWorldWidthAndHeightInPlane from '../../util/planar/getWorldWidthAndHeightInPlane';
import { indexWithinDimensions } from '../../util/vtkjs';
import { showToolCursor, hideToolCursor } from '../../store/toolCursor';

type Point = Array<number>;

export default class RectangleRoiTool extends BaseAnnotationTool {
  _throttledCalculateCachedStats: Function;
  editData: {
    toolData: any;
    viewportUIDsToRender: [];
    handleIndex?: number;
    movingTextBox: boolean;
    newAnnotation?: boolean;
    hasMoved?: boolean;
  } | null;
  name: string;
  _configuration: any;

  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'RectangleRoi',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: { shadow: true },
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
    const { viewPlaneNormal, viewUp } = camera;

    const toolData = {
      metadata: {
        viewPlaneNormal: [...viewPlaneNormal],
        viewUp: [...viewUp],
        FrameOfReferenceUID,
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: {
          points: [[...worldPos], [...worldPos], [...worldPos], [...worldPos]],
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
      handleIndex: 3,
      movingTextBox: false,
      newAnnotation: true,
      hasMoved: false,
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
      // If the bounding box for the textbox exists, see if we are clicking within it.
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

    const canavasPoint1 = viewport.worldToCanvas(points[0]);
    const canavasPoint2 = viewport.worldToCanvas(points[3]);

    const rect = this._getRectangleImageCoordinates([
      canavasPoint1,
      canavasPoint2,
    ]);

    const distanceToPoint = cornerstoneMath.rect.distanceToPoint(rect, {
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

    hideToolCursor(element);

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

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex,
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

    const {
      toolData,
      viewportUIDsToRender,
      newAnnotation,
      hasMoved,
    } = this.editData;
    const { data } = toolData;

    if (newAnnotation && !hasMoved) {
      return;
    }

    data.active = false;
    data.handles.activeHandleIndex = null;

    this._deactivateModify(element);
    this._deactivateDraw(element);

    showToolCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);

    this.editData = null;
  };

  _mouseDragCallback = (evt) => {
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
      // Move the text boxes world position
      const { deltaPoints } = eventData;
      const worldPosDelta = deltaPoints.world;

      const { textBox } = data.handles;
      const { worldPosition } = textBox;

      worldPosition[0] += worldPosDelta[0];
      worldPosition[1] += worldPosDelta[1];
      worldPosition[2] += worldPosDelta[2];

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
      // Moving tool, so move all points by the world points delta
      const { deltaPoints } = eventData;
      const worldPosDelta = deltaPoints.world;

      const { points } = data.handles;

      points.forEach((point) => {
        point[0] += worldPosDelta[0];
        point[1] += worldPosDelta[1];
        point[2] += worldPosDelta[2];
      });
    } else {
      // Moving handle.
      const { currentPoints } = eventData;
      const enabledElement = getEnabledElement(element);
      const { worldToCanvas, canvasToWorld } = enabledElement.viewport;
      const worldPos = currentPoints.world;

      const { points } = data.handles;

      // Move this handle.
      points[handleIndex] = [...worldPos];

      let bottomLeftCanvas;
      let bottomRightCanvas;
      let topLeftCanvas;
      let topRightCanvas;

      let bottomLeftWorld;
      let bottomRightWorld;
      let topLeftWorld;
      let topRightWorld;

      switch (handleIndex) {
        case 0:
        case 3:
          // Moving bottomLeft or topRight

          bottomLeftCanvas = worldToCanvas(points[0]);
          topRightCanvas = worldToCanvas(points[3]);

          bottomRightCanvas = [topRightCanvas[0], bottomLeftCanvas[1]];
          topLeftCanvas = [bottomLeftCanvas[0], topRightCanvas[1]];

          bottomRightWorld = canvasToWorld(bottomRightCanvas);
          topLeftWorld = canvasToWorld(topLeftCanvas);

          points[1] = bottomRightWorld;
          points[2] = topLeftWorld;

          break;
        case 1:
        case 2:
          // Moving bottomRight or topLeft
          bottomRightCanvas = worldToCanvas(points[1]);
          topLeftCanvas = worldToCanvas(points[2]);

          bottomLeftCanvas = [topLeftCanvas[0], bottomRightCanvas[1]];
          topRightCanvas = [bottomRightCanvas[0], topLeftCanvas[1]];

          bottomLeftWorld = canvasToWorld(bottomLeftCanvas);
          topRightWorld = canvasToWorld(topRightCanvas);

          points[0] = bottomLeftWorld;
          points[3] = topRightWorld;

          break;
      }
    }

    data.invalidated = true;
    this.editData.hasMoved = true;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateDraw = (element) => {
    state.isToolLocked = true;

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback);
    element.addEventListener(EVENTS.MOUSE_MOVE, this._mouseDragCallback);
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback);

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback);
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _deactivateDraw = (element) => {
    state.isToolLocked = false;

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback);
    element.removeEventListener(EVENTS.MOUSE_MOVE, this._mouseDragCallback);
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback);

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback);
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback);
  };

  /**
   * Add event handlers for the modify event loop, and prevent default event prapogation.
   */
  _activateModify = (element) => {
    state.isToolLocked = true;

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback);
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback);

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback);
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback);
  };

  /**
   * Remove event handlers for the modify event loop, and enable default event propagation.
   */
  _deactivateModify = (element) => {
    state.isToolLocked = false;

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback);
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback);

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback);
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback);
  };

  /**
   * getToolState = Custom getToolStateMethod with filtering.
   * @param element
   * @param toolState
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

      const { points, activeHandleIndex } = data.handles;

      if (!data.cachedStats[targetVolumeUID]) {
        // This volume has not had its stats calulcated yet, so recalculate the stats.
        data.cachedStats[targetVolumeUID] = {};

        const { viewPlaneNormal, viewUp } = viewport.getCamera();
        this._calculateCachedStats(data, viewPlaneNormal, viewUp);
      } else if (data.invalidated) {
        // The data has been invalidated as it was just edited. Recalculate cached stats.
        const { viewPlaneNormal, viewUp } = viewport.getCamera();
        this._throttledCalculateCachedStats(data, viewPlaneNormal, viewUp);
      }

      const textLines = this._getTextLines(data, targetVolumeUID);
      const canvasCoordinates = points.map((p) => viewport.worldToCanvas(p));

      let activeHandleCanvasCoords;

      if (!this.editData && activeHandleIndex !== null) {
        // Not creating and hovering over handle, so render handle.

        activeHandleCanvasCoords = [canvasCoordinates[activeHandleIndex]];
      }

      draw(context, (context) => {
        setShadow(context, this.configuration);

        if (activeHandleCanvasCoords) {
          drawHandles(context, activeHandleCanvasCoords, {
            color,
          });
        }

        drawRect(context, canvasCoordinates[0], canvasCoordinates[3], {
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

          const textBoxAnchorPoints = this._findTextBoxAnchorPoints(
            canvasCoordinates
          );

          drawLinkedTextBox(
            context,
            canvasTextBoxCoords,
            textLines,
            data.handles.textBox,
            textBoxAnchorPoints,
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

  /**
   * _findTextBoxAnchorPoints - Finds the middle points of each rectangle side
   * to attach the linked textbox to.
   *
   * @param {} points - An array of points.
   */
  _findTextBoxAnchorPoints = (points: Array<Point>): Array<Point> => {
    const { left, top, width, height } = this._getRectangleImageCoordinates(
      points
    );

    return [
      [
        // Top middle point of rectangle
        left + width / 2,
        top,
      ],
      [
        // Left middle point of rectangle
        left,
        top + height / 2,
      ],
      [
        // Bottom middle point of rectangle
        left + width / 2,
        top + height,
      ],
      [
        // Right middle point of rectangle
        left + width,
        top + height / 2,
      ],
    ];
  };

  _getRectangleImageCoordinates = (points: Array<Point>) => {
    const [point0, point1] = points;

    return {
      left: Math.min(point0[0], point1[0]),
      top: Math.min(point0[1], point1[1]),
      width: Math.abs(point0[0] - point1[0]),
      height: Math.abs(point0[1] - point1[1]),
    };
  };

  /**
   * _getTextLines - Returns the Area, mean and std deviation of the area of the
   * target volume enclosed by the rectangle.
   *
   * @param {object} data - The toolDatas tool-specific data.
   * @param {string} targetVolumeUID - The volumeUID of the volume to display the stats for.
   */
  _getTextLines = (data, targetVolumeUID: string) => {
    const cachedVolumeStats = data.cachedStats[targetVolumeUID];
    const { area, mean, stdDev, Modality } = cachedVolumeStats;

    if (mean === undefined) {
      return;
    }

    const textLines = [];

    let areaLine = `Area: ${area.toFixed(2)} mm${String.fromCharCode(178)}`;
    let meanLine = `Mean: ${mean.toFixed(2)}`;
    let stdDevLine = `Std Dev: ${stdDev.toFixed(2)}`;

    // Give appropriate units for the modality.
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

  /**
   * _calculateCachedStats - For each volume in the frame of reference that a
   * tool instance in particular viewport defines as its target volume, find the
   * volume coordinates (i,j,k) being probed by the two corners. One of i,j or k
   * will be constant across the two points. In the other two directions iterate
   * over the voxels and calculate the first and second-order statistics.
   *
   * @param {object} data - The toolDatas tool-specific data.
   * @param {Array<number>} viewPlaneNormal The normal vector of the camera.
   * @param {Array<number>} viewUp The viewUp vector of the camera.
   */
  _calculateCachedStats = (data, viewPlaneNormal, viewUp) => {
    const worldPos1 = data.handles.points[0];
    const worldPos2 = data.handles.points[3];
    const { cachedStats } = data;

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
        // Calculate index bounds to itterate over

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

        const area = worldWidth * worldHeight;

        let count = 0;
        let mean = 0;
        let stdDev = 0;

        const yMultiple = dimensions[0];
        const zMultiple = dimensions[0] * dimensions[1];

        // This is a tripple loop, but one of these 3 values will be constant
        // In the planar view.
        for (let k = kMin; k <= kMax; k++) {
          for (let j = jMin; j <= jMax; j++) {
            for (let i = iMin; i <= iMax; i++) {
              const value = scalarData[k * zMultiple + j * yMultiple + i];

              count++;
              mean += value;
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
