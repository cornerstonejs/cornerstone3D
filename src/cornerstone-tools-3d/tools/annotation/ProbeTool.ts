import { BaseAnnotationTool } from './../base/index';
// ~~ VTK Viewport
import { getEnabledElement, imageCache } from '../../../index';
import uuidv4 from '../../util/uuidv4.js';
import { getTargetVolume, getToolDataWithinSlice } from '../../util/planar';
import { addToolState, getToolState } from '../../stateManagement/toolState';
import toolColors from '../../stateManagement/toolColors';
import { draw, drawHandles, drawTextBox, getNewContext } from '../../drawing';
import { vec2, vec3 } from 'gl-matrix';
import { state } from '../../store';
import { VtkjsToolEvents as EVENTS } from '../../enums';
import { getViewportUIDsWithToolToRender } from '../../util/viewportFilters';
import { indexWithinDimensions } from '../../util/vtkjs';
import { showToolCursor, hideToolCursor } from '../../store/toolCursor';

export default class ProbeTool extends BaseAnnotationTool {
  touchDragCallback: Function;
  mouseDragCallback: Function;
  editData: { toolData: any; viewportUIDsToRender: [] } | null;
  name: string;
  _configuration: any;

  constructor(toolConfiguration = {}) {
    const defaultToolConfiguration = {
      name: 'Probe',
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
        FrameOfReferenceUID,
        toolName: this.name,
      },
      data: {
        invalidated: true,
        handles: { points: [[...worldPos]] },
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
    };
    this._activateModify(element);

    hideToolCursor(element);

    evt.preventDefault();

    renderingEngine.renderViewports(viewportUIDsToRender);
  }

  getHandleNearImagePoint(element, toolData, canvasCoords, proximity) {
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    const { data } = toolData;
    const point = data.handles.points[0];
    const toolDataCanvasCoordinate = viewport.worldToCanvas(point);

    const near =
      vec2.distance(canvasCoords, toolDataCanvasCoordinate) < proximity;

    if (near === true) {
      return point;
    }

    return near;
  }

  handleSelectedCallback(evt, toolData, handle, interactionType = 'mouse') {
    const eventData = evt.detail;
    const { element } = eventData;

    const { data } = toolData;

    data.active = true;

    const viewportUIDsToRender = getViewportUIDsWithToolToRender(
      element,
      this.name
    );

    // Find viewports to render on drag.

    this.editData = {
      //handle, // This would be useful for other tools with more than one handle
      toolData,
      viewportUIDsToRender,
    };
    this._activateModify(element);

    hideToolCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);

    evt.preventDefault();
  }

  _mouseUpCallback(evt) {
    const eventData = evt.detail;
    const { element } = eventData;

    const { toolData, viewportUIDsToRender } = this.editData;
    const { data } = toolData;

    data.active = false;

    this._deactivateModify(element);

    showToolCursor(element);

    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;

    renderingEngine.renderViewports(viewportUIDsToRender);

    this.editData = null;
  }

  _mouseDragCallback(evt) {
    const eventData = evt.detail;
    const { currentPoints, element } = eventData;
    const worldPos = currentPoints.world;

    const { toolData, viewportUIDsToRender } = this.editData;
    const { data } = toolData;

    data.handles.points[0] = [...worldPos];
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

      if (!data.cachedStats[targetVolumeUID]) {
        data.cachedStats[targetVolumeUID] = {};
        this._calculateCachedStats(data);
      } else if (data.invalidated) {
        this._calculateCachedStats(data);
      }

      const textLines = this._getTextLines(data, targetVolumeUID);

      const point = data.handles.points[0];

      const canvasCoordinates = viewport.worldToCanvas(point);

      draw(context, (context) => {
        drawHandles(context, [canvasCoordinates], { color });

        if (textLines) {
          const textCanvasCoorinates = [
            canvasCoordinates[0] + 6,
            canvasCoordinates[1] - 6,
          ];

          drawTextBox(
            context,
            textLines,
            textCanvasCoorinates[0],
            textCanvasCoorinates[1],
            color
          );
        }
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
      // Check if we have scaling for the other 2 SUV types for the PET.

      const imageVolume = imageCache.getImageVolume(targetVolumeUID);

      if (
        imageVolume.scaling.PET &&
        (imageVolume.scaling.PET.suvbwToSuvbsa ||
          imageVolume.scaling.PET.suvbwToSuvlbm)
      ) {
        const { suvbwToSuvlbm, suvbwToSuvbsa } = imageVolume.scaling.PET;

        textLines.push(`${value.toFixed(2)} SUV bw`);

        if (suvbwToSuvlbm) {
          const SUVLbm = value * suvbwToSuvlbm;

          textLines.push(`${SUVLbm.toFixed(2)} SUV lbm`);
        }

        if (suvbwToSuvlbm) {
          const SUVBsa = value * suvbwToSuvbsa;

          textLines.push(`${SUVBsa.toFixed(2)} SUV bsa`);
        }
      } else {
        textLines.push(`${value.toFixed(2)} SUV`);
      }
    } else if (Modality === 'CT') {
      textLines.push(`${value.toFixed(2)} HU`);
    } else {
      textLines.push(`${value.toFixed(2)} MO`);
    }

    return textLines;
  }

  _calculateCachedStats(data) {
    const worldPos = data.handles.points[0];
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
      const index = [0, 0, 0];

      imageData.worldToIndexVec3(worldPos, index);

      index[0] = Math.floor(index[0]);
      index[1] = Math.floor(index[1]);
      index[2] = Math.floor(index[2]);

      if (indexWithinDimensions(index, dimensions)) {
        const yMultiple = dimensions[0];
        const zMultiple = dimensions[0] * dimensions[1];

        const value =
          scalarData[index[2] * zMultiple + index[1] * yMultiple + index[0]];

        cachedStats[volumeUID] = {
          index,
          value,
          Modality: metadata.Modality,
        };
      } else {
        cachedStats[volumeUID] = {
          index,
          Modality: metadata.Modality,
        };
      }
    }

    data.invalidated = false;
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

  // preMouseDownCallback(evt) {
  //   console.log('probeTool PRE_MOUSE_DOWN');
  // }

  // postMouseDownCallback(evt) {
  //   console.log('probeTool POST_MOUSE_DOWN');
  // }

  // Takes ICornerstoneEvent, Mouse or Touch
  // _dragCallback(evt) {
  //   const { element: canvas, deltaPoints } = evt.detail;
  //   const enabledElement = getEnabledElement(canvas);

  //   const { x: deltaX, y: deltaY, z: deltaZ } = deltaPoints.world;
  // }
}
