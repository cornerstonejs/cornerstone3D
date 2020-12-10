import { BaseAnnotationTool } from './../base/index';
// ~~ VTK Viewport
import { getEnabledElement, imageCache } from '../../../index';
import uuidv4 from '../../util/uuidv4.js';
import { getTargetVolume, getToolDataWithinSlice } from '../../util/planar';
import { addToolState, getToolState } from '../../stateManagement/toolState';
import toolColors from '../../stateManagement/toolColors';
import {
  draw,
  drawHandles,
  drawTextBox,
  drawRect,
  getNewContext,
} from '../../drawing';
import { vec2, vec3 } from 'gl-matrix';
import { state } from '../../store';
import { VtkjsToolEvents as EVENTS } from '../../enums';
import {
  filterViewportsWithToolEnabled,
  filterViewportsWithFrameOfReferenceUID,
} from '../../util/viewportFilters';
import cornerstoneMath from 'cornerstone-math';

export default class RectangleRoiTool extends BaseAnnotationTool {
  touchDragCallback: Function;
  mouseDragCallback: Function;
  editData: {
    toolData: any;
    viewportUIDsToRender: [];
    handleIndex: number;
  } | null;
  name: string;
  _configuration: any;

  constructor(toolConfiguration = {}) {
    const defaultToolConfiguration = {
      name: 'RectangleRoi',
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
    };
    this._activateModify(element);

    evt.preventDefault();

    renderingEngine.renderViewports(viewportUIDsToRender);
  }

  getHandleNearImagePoint(element, toolData, canvasCoords, proximity) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = toolData;
    const points = data.handles.points;

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

    const canavasPoint1 = viewport.worldToCanvas(point1);
    const canavasPoint2 = viewport.worldToCanvas(point2);

    const rect = {
      left: Math.min(canavasPoint1[0], canavasPoint2[0]),
      top: Math.min(canavasPoint1[1], canavasPoint2[1]),
      width: Math.abs(canavasPoint1[0] - canavasPoint2[0]),
      height: Math.abs(canavasPoint1[1] - canavasPoint2[1]),
    };

    // TODO -> Not sure what to do about cornerstoneMath. Should we recreate it as we go for array coords?
    const distanceToPoint = cornerstoneMath.rect.distanceToPoint(rect, {
      x: canvasCoords[0],
      y: canvasCoords[1],
    });

    if (distanceToPoint <= proximity) {
      return true;
    }
  }

  toolSelectedCallback(evt, toolData, interactionType = 'mouse') {
    // TODO!
  }

  handleSelectedCallback(evt, toolData, handle, interactionType = 'mouse') {
    const eventData = evt.detail;
    const { element } = eventData;

    //TODO

    const { data } = toolData;

    data.active = true;

    const handleIndex = data.handles.points.findIndex(p => p === handle);

    const viewportUIDsToRender = this._getViewportUIDsToRender(element);

    // Find viewports to render on drag.

    this.editData = {
      //handle, // This would be useful for other tools with more than one handle
      toolData,
      viewportUIDsToRender,
      handleIndex,
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
    const { currentPoints, element } = eventData;
    const worldPos = currentPoints.world;

    const { toolData, viewportUIDsToRender, handleIndex } = this.editData;
    const { data } = toolData;

    data.handles.points[handleIndex] = [worldPos.x, worldPos.y, worldPos.z];
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

    // TODO refactor this to a helper so we can build by composition

    const enabledElement = getEnabledElement(element);
    const { viewport, scene } = enabledElement;
    const camera = viewport.getCamera();

    // TODO -> Cache this on camera change and on volume added?
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

    for (let i = 0; i < toolState.length; i++) {
      const toolData = toolState[i];
      const data = toolData.data;

      const color = toolColors.getColorIfActive(data);

      // if (!data.cachedStats[targetVolumeUID]) {
      //   data.cachedStats[targetVolumeUID] = {};
      //   this._calculateCachedStats(data);
      // } else if (data.invalidated) {
      //   this._calculateCachedStats(data);
      // }

      //const textLines = this._getTextLines(data, targetVolumeUID);

      const points = data.handles.points;

      const canvasCoordinates = points.map(p => viewport.worldToCanvas(p));

      draw(context, context => {
        drawHandles(context, canvasCoordinates, { color });

        drawRect(context, canvasCoordinates[0], canvasCoordinates[1], {
          color,
        });

        // if (textLines) {
        //   const textCanvasCoorinates = [
        //     canvasCoordinates[0] + 6,
        //     canvasCoordinates[1] - 6,
        //   ];

        //   drawTextBox(
        //     context,
        //     textLines,
        //     textCanvasCoorinates[0],
        //     textCanvasCoorinates[1],
        //     color
        //   );
        // }
      });
    }
  }

  _getTextLines(data, targetVolumeUID) {
    const cachedVolumeStats = data.cachedStats[targetVolumeUID];
    const { index, value, Modality } = cachedVolumeStats;

    if (value === undefined) {
      return;
    }

    const textLines = [];

    textLines.push(`(${index[0]}, ${index[1]}, ${index[2]})`);

    if (Modality === 'PT') {
      const valueLine = `${value.toFixed(3)} SUV`;

      textLines.push(valueLine);
    } else if (Modality === 'CT') {
      const valueLine = `${value.toFixed(3)} HU`;

      textLines.push(valueLine);
    } else {
      const valueLine = `${value.toFixed(3)} MO`;

      textLines.push(valueLine);
    }

    return textLines;
  }

  _calculateCachedStats(data) {
    const worldPos1 = data.handles.points[0];
    const worldPos2 = data.handles.points[1];
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

      // if (
      //   this._indexWithinDimensions(worldPos1Index, dimensions) ||
      //   this._indexWithinDimensions(worldPos2Index, dimensions)
      // ) {
      // } else {
      //   cachedStats[volumeUID] = {
      //     //     index,
      //     //     Modality: metadata.Modality,
      //     //   };
      //   };

      //   // if (this._indexWithinDimensions(index, dimensions)) {
      //   //   const yMultiple = dimensions[0];
      //   //   const zMultiple = dimensions[0] * dimensions[1];

      //   //   const value =
      //   //     scalarData[index[2] * zMultiple + index[1] * yMultiple + index[0]];

      //   //   cachedStats[volumeUID] = {
      //   //     index,
      //   //     value,
      //   //     Modality: metadata.Modality,
      //   //   };
      // }
    }
  }

  _indexWithinDimensions(index, dimensions) {
    if (
      index[0] < 0 ||
      index[0] > dimensions[0] ||
      index[1] < 0 ||
      index[1] > dimensions[1] ||
      index[2] < 0 ||
      index[2] > dimensions[2]
    ) {
      return false;
    }

    return true;
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
