import { BaseAnnotationTool } from './../base/index';
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
  drawEllipse,
  getNewContext,
} from '../../drawing';
import { vec2, vec3 } from 'gl-matrix';
import { state } from '../../store';
import { VtkjsToolEvents as EVENTS } from '../../enums';
import {
  filterViewportsWithToolEnabled,
  filterViewportsWithFrameOfReferenceUID,
} from '../../util/viewportFilters';

import getROITextBoxCoordsCanvas from '../../util/getROITextBoxCoordsCanvas';
import pointInEllipse from '../../util/pointInEllipse';
import getWorldWidthAndHeightInPlane from '../../util/planar/getWorldWidthAndHeightInPlane';

export default class EllipticalRoiTool extends BaseAnnotationTool {
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
    const defaultToolConfiguration = {
      name: 'EllipticalRoi',
      supportedInteractionTypes: ['Mouse', 'Touch'],
    };

    super(toolConfiguration, defaultToolConfiguration);

    /**
     * Will only fire fore cornerstone events:
     * - TOUCH_DRAG
     * - MOUSE_DRAG
     *
     * Given that the tool is active and has matching bindings for the
     * underlying touch/mouse event.
     */
    this._activateModify = this._activateModify.bind(this);
    this._deactivateModify = this._deactivateModify.bind(this);
    this._mouseUpCallback = this._mouseUpCallback.bind(this);
    this._mouseDragCallback = this._mouseDragCallback.bind(this);

    this._throttledCalculateCachedStats = throttle(
      this._calculateCachedStats,
      100,
      { trailing: true }
    );
  }

  addNewMeasurement(evt, interactionType) {
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
        toolUID: uuidv4(), // TODO: Should probably do this in the tool manager if you don't add your own.
        FrameOfReferenceUID,
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: {
          points: [
            [worldPos.x, worldPos.y, worldPos.z],
            [worldPos.x, worldPos.y, worldPos.z],
          ],
          textBox: {
            hasMoved: false,
            worldPosition: [0, 0, 0],
          },
        },
        cachedStats: {},
        active: true,
      },
    };

    addToolState(element, toolData);

    const viewportUIDsToRender = this._getViewportUIDsToRender(element);

    this.editData = {
      toolData,
      viewportUIDsToRender,
      handleIndex: 1,
      movingTextBox: false,
    };
    this._activateModify(element);

    evt.preventDefault();

    renderingEngine.renderViewports(viewportUIDsToRender);
  }

  getHandleNearImagePoint(element, toolData, canvasCoords, proximity) {
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
        return textBox;
      }
    }

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const toolDataCanvasCoordinate = viewport.worldToCanvas(point);

      const near =
        vec2.distance(canvasCoords, toolDataCanvasCoordinate) < proximity;

      if (near === true) {
        return point;
      }
    }
  }

  pointNearTool(element, toolData, canvasCoords, proximity) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = toolData;
    const [point1, point2] = data.handles.points;

    const canvasPoint1 = viewport.worldToCanvas(point1);
    const canvasPoint2 = viewport.worldToCanvas(point2);

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
  }

  toolSelectedCallback(evt, toolData, interactionType = 'mouse') {
    const eventData = evt.detail;
    const { element } = eventData;

    const { data } = toolData;

    data.active = true;

    const viewportUIDsToRender = this._getViewportUIDsToRender(element);

    this.editData = {
      toolData,
      viewportUIDsToRender,
      movingTextBox: false,
    };

    this._activateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);

    evt.preventDefault();
  }

  handleSelectedCallback(evt, toolData, handle, interactionType = 'mouse') {
    const eventData = evt.detail;
    const { element } = eventData;
    const { data } = toolData;

    data.active = true;

    let movingTextBox = false;
    let handleIndex;

    if (handle.worldPosition) {
      movingTextBox = true;
    } else {
      handleIndex = data.handles.points.findIndex(p => p === handle);
    }

    // Find viewports to render on drag.
    const viewportUIDsToRender = this._getViewportUIDsToRender(element);

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
  }

  _getViewportUIDsToRender(element) {
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, FrameOfReferenceUID } = enabledElement;

    let viewports = renderingEngine.getViewports();

    viewports = filterViewportsWithFrameOfReferenceUID(
      viewports,
      FrameOfReferenceUID
    );
    viewports = filterViewportsWithToolEnabled(viewports, this.name);

    const viewportUIDs = viewports.map(vp => vp.uid);

    return viewportUIDs;
  }

  _mouseUpCallback(evt) {
    const eventData = evt.detail;
    const { element } = eventData;

    const { toolData, viewportUIDsToRender } = this.editData;
    const { data } = toolData;

    data.active = false;

    this._deactivateModify(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);

    this.editData = null;
  }

  _mouseDragCallback(evt) {
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

      worldPosition[0] += worldPosDelta.x;
      worldPosition[1] += worldPosDelta.y;
      worldPosition[2] += worldPosDelta.z;

      textBox.hasMoved = true;
    } else if (handleIndex === undefined) {
      // Moving tool
      const { deltaPoints } = eventData;
      const worldPosDelta = deltaPoints.world;

      const points = data.handles.points;

      points.forEach(point => {
        point[0] += worldPosDelta.x;
        point[1] += worldPosDelta.y;
        point[2] += worldPosDelta.z;
      });
    } else {
      // Moving handle
      const { currentPoints } = eventData;
      const worldPos = currentPoints.world;

      data.handles.points[handleIndex] = [worldPos.x, worldPos.y, worldPos.z];
    }

    data.invalidated = true;

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);
  }

  _activateModify(element) {
    state.isToolLocked = true;

    element.addEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback);
    element.addEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback);
    element.addEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback);

    element.addEventListener(EVENTS.TOUCH_END, this._mouseUpCallback);
    element.addEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback);
  }

  _deactivateModify(element) {
    state.isToolLocked = false;

    element.removeEventListener(EVENTS.MOUSE_UP, this._mouseUpCallback);
    element.removeEventListener(EVENTS.MOUSE_DRAG, this._mouseDragCallback);
    element.removeEventListener(EVENTS.MOUSE_CLICK, this._mouseUpCallback);

    element.removeEventListener(EVENTS.TOUCH_END, this._mouseUpCallback);
    element.removeEventListener(EVENTS.TOUCH_DRAG, this._mouseDragCallback);
  }

  /**
   * getToolState = Custom getToolStateMethod with filtering.
   * @param element
   */
  filterInteractableToolStateForElement(element, toolState) {
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
  }

  renderToolData(evt) {
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

      if (!data.cachedStats[targetVolumeUID]) {
        data.cachedStats[targetVolumeUID] = {};

        this._calculateCachedStats(data, viewport);
      } else if (data.invalidated) {
        this._throttledCalculateCachedStats(data, viewport);
      }

      const textLines = this._getTextLines(data, targetVolumeUID);

      const points = data.handles.points;

      const canvasCoordinates = points.map(p => viewport.worldToCanvas(p));

      draw(context, context => {
        drawHandles(context, canvasCoordinates, { color });

        drawEllipse(context, canvasCoordinates[0], canvasCoordinates[1], {
          color,
        });

        if (textLines) {
          let canvasTextBoxCoords;

          if (!data.handles.textBox.hasMoved) {
            canvasTextBoxCoords = getROITextBoxCoordsCanvas(canvasCoordinates);

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
  }

  _findTextBoxAnchorPoints(points) {
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
  }

  _getRectangleImageCoordinates(points) {
    const [point0, point1] = points;

    return {
      left: Math.min(point0[0], point1[0]),
      top: Math.min(point0[1], point1[1]),
      width: Math.abs(point0[0] - point1[0]),
      height: Math.abs(point0[1] - point1[1]),
    };
  }

  _getTextLines(data, targetVolumeUID) {
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
  }

  _calculateCachedStats(data, viewport) {
    const worldPos1 = data.handles.points[0];
    const worldPos2 = data.handles.points[1];

    const canvasPoint1 = viewport.worldToCanvas(worldPos1);
    const canvasPoint2 = viewport.worldToCanvas(worldPos2);

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
        const plusICanvasDelta = [];
        imageData.indexToWorldVec3(startPlusI, worldPosStartPlusI);
        const canvasPosStartPlusI = viewport.worldToCanvas(worldPosStartPlusI);
        vec2.sub(plusICanvasDelta, canvasPosStartPlusI, canvasPosStart);

        const worldPosStartPlusJ = vec3.create();
        const plusJCanvasDelta = [];
        imageData.indexToWorldVec3(startPlusJ, worldPosStartPlusJ);
        const canvasPosStartPlusJ = viewport.worldToCanvas(worldPosStartPlusJ);
        vec2.sub(plusJCanvasDelta, canvasPosStartPlusJ, canvasPosStart);

        const worldPosStartPlusK = vec3.create();
        const plusKCanvasDelta = [];
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
  }

  _isInsideVolume(index1, index2, dimensions) {
    return (
      this._indexWithinDimensions(index1, dimensions) &&
      this._indexWithinDimensions(index2, dimensions)
    );
  }

  _indexWithinDimensions(index, dimensions) {
    if (
      index[0] < 0 ||
      index[0] >= dimensions[0] ||
      index[1] < 0 ||
      index[1] >= dimensions[1] ||
      index[2] < 0 ||
      index[2] >= dimensions[2]
    ) {
      return false;
    }

    return true;
  }

  _clipIndexToVolume(index, dimensions) {
    for (let i = 0; i <= 2; i++) {
      if (index[i] < 0) {
        index[i] = 0;
      } else if (index[i] >= dimensions[i]) {
        index[i] = dimensions[i] - 1;
      }
    }
  }

  _getTargetVolumeUID(scene) {
    if (this._configuration.volumeUID) {
      return this._configuration.volumeUID;
    }

    const volumeActors = scene.getVolumeActors();

    if (!volumeActors && !volumeActors.length) {
      // No stack to scroll through
      return;
    }

    return volumeActors[0].uid;
  }
}
