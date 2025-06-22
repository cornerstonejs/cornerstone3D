import { vec2, vec3 } from 'gl-matrix';
import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

import { AnnotationTool } from './base';

import type { Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  getEnabledElementByIds,
  getEnabledElement,
  utilities as csUtils,
  Enums,
  CONSTANTS,
  triggerEvent,
  eventTarget,
} from '@cornerstonejs/core';
import { Enums as toolsEnums } from '@cornerstonejs/tools';

import {
  getToolGroup,
  getToolGroupForViewport,
} from '../store/ToolGroupManager';

import { state } from '../store/state';
import { Events } from '../enums';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import {
  resetElementCursor,
  hideElementCursor,
} from '../cursors/elementCursor';

import * as lineSegment from '../utilities/math/line';
import type {
  Annotation,
  Annotations,
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  InteractionTypes,
} from '../types';
import { isAnnotationLocked } from '../stateManagement/annotation/annotationLocking';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';

const { RENDERING_DEFAULTS } = CONSTANTS;

//interface VolumeCroppingAnnotation extends Annotation {
interface VolumeCroppingAnnotation extends Annotation {
  data: {
    handles: {
      //  rotationPoints: Types.Point3[]; // rotation handles, used for rotation interactions
      //  slabThicknessPoints: Types.Point3[]; // slab thickness handles, used for setting the slab thickness
      activeOperation: number | null; // 0 translation, 1 rotation handles, 2 slab thickness handles
      toolCenter: Types.Point3;
    };
    activeViewportIds: string[]; // a list of the viewport ids connected to the reference lines being translated
    viewportId: string;
    referenceLines: []; // set in renderAnnotation
    clippingPlanes?: vtkPlane[]; // clipping planes for the viewport
    clippingPlaneReferenceLines?: [];
  };
}

function defaultReferenceLineColor() {
  return 'rgb(0, 200, 0)';
}

function defaultReferenceLineControllable() {
  return true;
}

const OPERATION = {
  DRAG: 1,
  ROTATE: 2,
  SLAB: 3,
};

/**
 * VolumeCroppingTool is a tool that provides reference lines between different viewports
 * of a toolGroup. Using crosshairs, you can jump to a specific location in one
 * viewport and the rest of the viewports in the toolGroup will be aligned to that location.
 *
 */
class VolumeCroppingTool extends AnnotationTool {
  static toolName;
  sphereStates: {
    point: Types.Point3;
    axis: string;
    uid: string;
    sphereSource;
    sphereActor;
  }[] = [];
  draggingSphereIndex: number | null = null;
  toolCenter: Types.Point3 = [0, 0, 0]; // NOTE: it is assumed that all the active/linked viewports share the same crosshair center.
  // This because the rotation operation rotates also all the other active/intersecting reference lines of the same angle
  _getReferenceLineColor?: (viewportId: string) => string;
  _getReferenceLineControllable?: (viewportId: string) => boolean;
  _getReferenceLineDraggableRotatable?: (viewportId: string) => boolean;
  picker: vtkCellPicker;
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        // renders a colored circle on top right of the viewports whose color
        // matches the color of the reference line
        viewportIndicators: false,
        viewportIndicatorsConfig: {
          radius: 5,
          x: null,
          y: null,
        },
        // Auto pan is a configuration which will update pan
        // other viewports in the toolGroup if the center of the crosshairs
        // is outside of the viewport. This might be useful for the case
        // when the user is scrolling through an image (usually in the zoomed view)
        // and the crosshairs will eventually get outside of the viewport for
        // the other viewports.
        autoPan: {
          enabled: false,
          panSize: 10,
        },
        handleRadius: 3,
        // Enable HDPI rendering for handles using devicePixelRatio
        enableHDPIHandles: false,
        // radius of the area around the intersection of the planes, in which
        // the reference lines will not be rendered. This is only used when
        // having 3 viewports in the toolGroup.
        referenceLinesCenterGapRadius: 20,

        mobile: {
          enabled: false,
          opacity: 0.8,
          handleRadius: 9,
        },
        initialCropFactor: 0.2,
        sphereColors: {
          x: [0.0, 1.0, 0.0], // Green for X
          y: [1.0, 1.0, 0.0], // Yellow for Y
          z: [1.0, 0.0, 0.0], // Red for Z
          default: [0.0, 0.0, 1.0], // Blue as fallback
        },
        sphereRadius: 10,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    this._getReferenceLineColor =
      toolProps.configuration?.getReferenceLineColor ||
      defaultReferenceLineColor;
    this._getReferenceLineControllable =
      toolProps.configuration?.getReferenceLineControllable ||
      defaultReferenceLineControllable;
    this.picker = vtkCellPicker.newInstance({ opacityThreshold: 0.0001 });
    this.picker.setPickFromList(1);
    this.picker.setTolerance(0);
    this.picker.initializePickList();
  }

  _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId).viewportsInfo;
    return viewports;
  };

  onSetToolActive() {
    const viewportsInfo = this._getViewportsInfo();

    // Upon new setVolumes on viewports we need to update the crosshairs
    // reference points in the new space, so we subscribe to the event
    // and update the reference points accordingly.
    this._unsubscribeToViewportNewVolumeSet(viewportsInfo);
    this._subscribeToViewportNewVolumeSet(viewportsInfo);
    this._initialize3DViewports(viewportsInfo);
  }

  onSetToolPassive() {
    const viewportsInfo = this._getViewportsInfo();
    //  this._initialize3DViewports(viewportsInfo);
  }

  onSetToolEnabled() {
    const viewportsInfo = this._getViewportsInfo();
    this._initialize3DViewports(viewportsInfo);
  }

  onSetToolDisabled() {
    const viewportsInfo = this._getViewportsInfo();
    this._unsubscribeToViewportNewVolumeSet(viewportsInfo);
  }

  addSphere(viewport, point, axis) {
    // Generate a unique UID for each sphere based on its axis and position
    const uid = `${axis}_${point.map((v) => Math.round(v)).join('_')}`;
    const sphereState = this.sphereStates.find((s) => s.uid === uid);
    const sphereSource = vtkSphereSource.newInstance();
    sphereSource.setCenter(point);
    const sphereRadius =
      this.configuration.sphereRadius !== undefined
        ? this.configuration.sphereRadius
        : 15;
    sphereSource.setRadius(sphereRadius);
    const sphereMapper = vtkMapper.newInstance();
    sphereMapper.setInputConnection(sphereSource.getOutputPort());
    const sphereActor = vtkActor.newInstance();
    sphereActor.setMapper(sphereMapper);

    // Store or update the sphere position
    const idx = this.sphereStates.findIndex((s) => s.uid === uid);
    if (idx === -1) {
      this.sphereStates.push({
        point: point.slice(),
        axis,
        uid,
        sphereSource,
        sphereActor,
      });
    } else {
      this.sphereStates[idx].point = point.slice();
      this.sphereStates[idx].sphereSource = sphereSource;
    }

    // Remove existing actor with this UID if present
    const existingActors = viewport.getActors();
    const existing = existingActors.find((a) => a.uid === uid);
    if (existing) {
      //viewport.removeActor(uid);
      return;
    }

    let color = [0.0, 1.0, 0.0];
    if (axis === 'z') {
      color = [1.0, 0.0, 0.0];
    } else if (axis === 'x') {
      color = [1.0, 1.0, 0.0];
    }
    sphereActor.getProperty().setColor(color);

    /*
    const sphereColors = this.configuration.sphereColors || {};
    const color = sphereColors[this.sphereStates[idx].axis] ||
      sphereColors.default || [0.0, 0.0, 1.0];
    sphereActor.getProperty().setColor(color);
*/
    sphereActor.setPickable(true);
    viewport.addActor({ actor: sphereActor, uid: uid });
    // console.debug('added sphere: ', uid, viewport.getActors());
    viewport.render();
  }

  _initialize3DViewports = (viewportsInfo): void => {
    const [viewport3D] = viewportsInfo;
    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    const viewport = renderingEngine.getViewport(viewport3D.viewportId);
    const volumeActors = viewport.getActors();
    const imageData = volumeActors[0].actor.getMapper().getInputData();
    const dimensions = imageData.getDimensions();
    const origin = imageData.getOrigin();
    const spacing = imageData.getSpacing(); // [xSpacing, ySpacing, zSpacing]
    const cropFactor = 0.2;
    const xMin = origin[0] + cropFactor * (dimensions[0] - 1) * spacing[0];
    const xMax =
      origin[0] + (1 - cropFactor) * (dimensions[0] - 1) * spacing[0];
    const yMin = origin[1] + cropFactor * (dimensions[1] - 1) * spacing[1];
    const yMax =
      origin[1] + (1 - cropFactor) * (dimensions[1] - 1) * spacing[1];
    const zMin = origin[2] + cropFactor * (dimensions[2] - 1) * spacing[2];
    const zMax = origin[2] + 0.8 * (dimensions[2] - 1) * spacing[2];

    const planes: vtkPlane[] = [];

    // X min plane (cuts everything left of xMin)
    const planeXmin = vtkPlane.newInstance({
      origin: [xMin, 0, 0],
      normal: [1, 0, 0],
    });
    const planeXmax = vtkPlane.newInstance({
      origin: [xMax, 0, 0],
      normal: [-1, 0, 0],
    });
    const planeYmin = vtkPlane.newInstance({
      origin: [0, yMin, 0],
      normal: [0, 1, 0],
    });
    const planeYmax = vtkPlane.newInstance({
      origin: [0, yMax, 0],
      normal: [0, -1, 0],
    });
    const planeZmin = vtkPlane.newInstance({
      origin: [0, 0, zMin],
      normal: [0, 0, 1],
    });
    const planeZmax = vtkPlane.newInstance({
      origin: [0, 0, zMax],
      normal: [0, 0, -1],
    });

    const mapper = viewport.getDefaultActor().actor.getMapper();
    planes.push(planeXmin);
    mapper.addClippingPlane(planeXmin);
    planes.push(planeXmax);
    mapper.addClippingPlane(planeXmax);
    planes.push(planeYmin);
    mapper.addClippingPlane(planeYmin);
    planes.push(planeYmax);
    mapper.addClippingPlane(planeYmax);
    planes.push(planeZmin);
    mapper.addClippingPlane(planeZmin);
    planes.push(planeZmax);
    mapper.addClippingPlane(planeZmax);
    const originalPlanes = planes.map((plane) => ({
      origin: [...plane.getOrigin()],
      normal: [...plane.getNormal()],
    }));

    viewport.setOriginalClippingPlanes(originalPlanes);

    const sphereXminPoint = [xMin, (yMax + yMin) / 2, (zMax + zMin) / 2];
    const sphereXmaxPoint = [xMax, (yMax + yMin) / 2, (zMax + zMin) / 2];
    const sphereYminPoint = [(xMax + xMin) / 2, yMin, (zMax + zMin) / 2];
    const sphereYmaxPoint = [(xMax + xMin) / 2, yMax, (zMax + zMin) / 2];
    const sphereZminPoint = [(xMax + xMin) / 2, (yMax + yMin) / 2, zMin];
    const sphereZmaxPoint = [(xMax + xMin) / 2, (yMax + yMin) / 2, zMax];

    this.addSphere(viewport, sphereXminPoint, 'x');
    this.addSphere(viewport, sphereXmaxPoint, 'x');
    this.addSphere(viewport, sphereYminPoint, 'y');
    this.addSphere(viewport, sphereYmaxPoint, 'y');
    this.addSphere(viewport, sphereZminPoint, 'z');
    this.addSphere(viewport, sphereZmaxPoint, 'z');
    const defaultActor = viewport.getDefaultActor();
    if (defaultActor?.actor) {
      // Cast to any to avoid type errors with different actor types
      this.picker.addPickList(defaultActor.actor);
      this._prepareImageDataForPicking(viewport);
    }

    const element = viewport.canvas || viewport.element;
    element.addEventListener('mousedown', this._onMouseDownSphere);
    element.addEventListener('mousemove', this._onMouseMoveSphere);
    element.addEventListener('mouseup', this._onMouseUpSphere);

    mapper.modified();
    viewport.getDefaultActor().actor.modified();
    volumeActors.forEach((actorObj) => {
      if (actorObj.actor && typeof actorObj.actor.modified === 'function') {
        actorObj.actor.modified();
      }
    });
    viewport.render();
    eventTarget.addEventListener(
      Events.CROSSHAIR_TOOL_CENTER_CHANGED,
      (evt) => {
        console.debug('CROSSHAIR_TOOL_CENTER_CHANGED', evt);
        viewportsInfo = this._getViewportsInfo();
        const [viewport3D] = viewportsInfo;

        const renderingEngine = getRenderingEngine(
          viewport3D.renderingEngineId
        );
        const viewport = renderingEngine.getViewport(viewport3D.viewportId);

        const { toolCenter } = evt.detail;
        viewport.setCamera({
          focalPoint: toolCenter,
        });
      }
    );

    eventTarget.addEventListener(
      Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED,
      (evt) => {
        // coronal  is x axis in green
        // sagittal is y axis in yellow
        // axial    is z axis in red
        //console.debug('VOLUMECROPPINGCONTROL_TOOL_CHANGED', evt.detail.toolCenter);

        viewportsInfo = this._getViewportsInfo();
        const [viewport3D] = viewportsInfo;

        const renderingEngine = getRenderingEngine(
          viewport3D.renderingEngineId
        );
        const viewport = renderingEngine.getViewport(viewport3D.viewportId);
        const toolMin = evt.detail.toolCenter;
        const planeXmin = vtkPlane.newInstance({
          origin: [toolMin[0], 0, 0],
          normal: [1, 0, 0],
        });
        const planeYmin = vtkPlane.newInstance({
          origin: [0, toolMin[1], 0],
          normal: [0, 1, 0],
        });
        const planeZmin = vtkPlane.newInstance({
          origin: [0, 0, toolMin[2]],
          normal: [0, 0, 1],
        });
        viewport.setOriginalClippingPlane(0, planeXmin.getOrigin());
        viewport.setOriginalClippingPlane(2, planeYmin.getOrigin());
        viewport.setOriginalClippingPlane(4, planeZmin.getOrigin());

        const volumeActor = viewport.getDefaultActor()?.actor;
        if (!volumeActor) {
          console.warn('No volume actor found');
          return;
        }
        const mapper = volumeActor.getMapper();
        const clippingPlanes = mapper.getClippingPlanes();
        clippingPlanes[0].setOrigin(planeXmin.getOrigin());
        clippingPlanes[2].setOrigin(planeYmin.getOrigin());
        clippingPlanes[4].setOrigin(planeZmin.getOrigin());

        this.sphereStates[0].sphereSource.setCenter(
          planeXmin.getOrigin()[0],
          this.sphereStates[0].point[1],
          this.sphereStates[0].point[2]
        );
        const otherXSphere = this.sphereStates.find(
          (s, i) => s.axis === 'x' && i !== 0
        );
        const newXCenter =
          (otherXSphere.point[0] + planeXmin.getOrigin()[0]) / 2;
        this.sphereStates.forEach((state, idx) => {
          if (state.axis !== 'x') {
            state.point[0] = newXCenter;
            state.sphereSource.setCenter(state.point);
          }
        });
        this.sphereStates[2].sphereSource.setCenter(
          this.sphereStates[2].point[0],
          planeYmin.getOrigin()[1],
          this.sphereStates[2].point[2]
        );
        const otherYSphere = this.sphereStates.find(
          (s, i) => s.axis === 'y' && i !== 2
        );
        const newYCenter =
          (otherYSphere.point[1] + planeYmin.getOrigin()[1]) / 2;
        this.sphereStates.forEach((state, idx) => {
          if (state.axis !== 'y') {
            state.point[1] = newYCenter;
            state.sphereSource.setCenter(state.point);
          }
        });
        this.sphereStates[4].sphereSource.setCenter(
          this.sphereStates[4].point[0],
          this.sphereStates[4].point[1],
          planeZmin.getOrigin()[2]
        );
        const otherZSphere = this.sphereStates.find(
          (s, i) => s.axis === 'z' && i !== 4
        );
        const newZCenter =
          (otherZSphere.point[2] + planeZmin.getOrigin()[2]) / 2;
        this.sphereStates.forEach((state, idx) => {
          if (state.axis !== 'z') {
            state.point[2] = newZCenter;
            state.sphereSource.setCenter(state.point);
          }
        });

        viewport.render();
      }
    );
  };

  /**
   * Creates the minimum infrastructure needed to pick a point in the 3D volume
   * with VTK.js
   * @remarks
   * @param viewport
   * @returns
   */
  _prepareImageDataForPicking = (viewport) => {
    const volumeActor = viewport.getDefaultActor()?.actor;
    if (!volumeActor) {
      return;
    }
    // Get the imageData from the volumeActor
    const imageData = volumeActor.getMapper().getInputData();

    if (!imageData) {
      console.error('No imageData found in the volumeActor');
      return null;
    }

    // Get the voxelManager from the imageData
    const { voxelManager } = imageData.get('voxelManager');

    if (!voxelManager) {
      console.error('No voxelManager found in the imageData');
      return imageData;
    }

    // Create a fake scalar object to expose the scalar data to VTK.js
    const fakeScalars = {
      getData: () => {
        return voxelManager.getCompleteScalarDataArray();
      },
      getNumberOfComponents: () => voxelManager.numberOfComponents,
      getDataType: () =>
        voxelManager.getCompleteScalarDataArray().constructor.name,
    };

    // Set the point data to return the fakeScalars
    imageData.setPointData({
      getScalars: () => fakeScalars,
    });
  };

  _onMouseDownSphere = (evt) => {
    const element = evt.currentTarget;
    const viewportsInfo = this._getViewportsInfo();
    const [viewport3D] = viewportsInfo;

    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    const viewport = renderingEngine.getViewport(viewport3D.viewportId);
    const mouseCanvas = [evt.offsetX, evt.offsetY];
    // Find the sphere under the mouse
    for (let i = 0; i < this.sphereStates.length; ++i) {
      const sphereCanvas = viewport.worldToCanvas(this.sphereStates[i].point);
      const dist = Math.sqrt(
        Math.pow(mouseCanvas[0] - sphereCanvas[0], 2) +
          Math.pow(mouseCanvas[1] - sphereCanvas[1], 2)
      );
      if (dist < 20) {
        // 20 pixels threshold
        this.draggingSphereIndex = i;
        element.style.cursor = 'grabbing';
        console.debug('grabbing sphere index: ', i);
        return;
      }
    }
    this.draggingSphereIndex = null;
  };

  _onMouseMoveSphere = (evt) => {
    if (this.draggingSphereIndex === null) {
      return;
    }
    evt.stopPropagation();
    evt.preventDefault();

    const element = evt.currentTarget;
    const viewportsInfo = this._getViewportsInfo();
    const [viewport3D] = viewportsInfo;
    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    const viewport = renderingEngine.getViewport(viewport3D.viewportId);

    // Use vtkCellPicker to get world coordinates

    const rect = element.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    const displayCoords = viewport.getVtkDisplayCoords([x, y]);
    // Use the picker to get the 3D coordinates

    // --- Remove clipping planes before picking otherwise we cannot back out of the volume
    const mapper = viewport.getDefaultActor().actor.getMapper();
    const originalClippingPlanes = mapper.getClippingPlanes().slice();
    mapper.removeAllClippingPlanes();
    this.picker.pick(
      [displayCoords[0], displayCoords[1], 0],
      viewport.getRenderer()
    );
    // --- Restore clipping planes after picking ---
    originalClippingPlanes.forEach((plane) => {
      mapper.addClippingPlane(plane);
    });
    const pickedPositions = this.picker.getPickedPositions();
    if (pickedPositions.length > 0) {
      const pickedPoint = pickedPositions[0];

      const sphereState = this.sphereStates[this.draggingSphereIndex];
      const newPoint = [...sphereState.point];
      // Restrict movement to the sphere's axis only
      if (sphereState.axis === 'x') {
        newPoint[0] = pickedPoint[0];
        const otherXSphere = this.sphereStates.find(
          (s, i) => s.axis === 'x' && i !== this.draggingSphereIndex
        );
        const newXCenter = (otherXSphere.point[0] + pickedPoint[0]) / 2;
        this.sphereStates.forEach((state, idx) => {
          if (state.axis !== 'x') {
            state.point[0] = newXCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereSource.modified();
          }
        });
      } else if (sphereState.axis === 'y') {
        newPoint[1] = pickedPoint[1];
        const otherYSphere = this.sphereStates.find(
          (s, i) => s.axis === 'y' && i !== this.draggingSphereIndex
        );
        const newYCenter = (otherYSphere.point[1] + pickedPoint[1]) / 2;
        this.sphereStates.forEach((state, idx) => {
          if (state.axis !== 'y') {
            state.point[1] = newYCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereSource.modified();
          }
        });
      } else if (sphereState.axis === 'z') {
        newPoint[2] = pickedPoint[2];
        const otherZSphere = this.sphereStates.find(
          (s, i) => s.axis === 'z' && i !== this.draggingSphereIndex
        );
        const newZCenter = (otherZSphere.point[2] + pickedPoint[2]) / 2;
        this.sphereStates.forEach((state, idx) => {
          if (state.axis !== 'z') {
            state.point[2] = newZCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereSource.modified();
          }
        });
      }

      sphereState.point = newPoint;
      sphereState.sphereSource.setCenter(newPoint);
      sphereState.sphereSource.modified();
      const volumeActor = viewport.getDefaultActor()?.actor;
      if (!volumeActor) {
        console.warn('No volume actor found');
        return;
      }
      const mapper = volumeActor.getMapper();
      const clippingPlanes = mapper.getClippingPlanes();
      clippingPlanes[this.draggingSphereIndex].setOrigin(newPoint);
      viewport.setOriginalClippingPlane(this.draggingSphereIndex, newPoint);
      viewport.render();
      /// Send event with the new point
      triggerEvent(eventTarget, Events.VOLUMECROPPING_TOOL_CHANGED, {
        toolCenter: newPoint,
        axis: sphereState.axis,
        draggingSphereIndex: this.draggingSphereIndex,
      });
    }
  };

  _onMouseUpSphere = (evt) => {
    //evt.stopPropagation();
    // evt.preventDefault();
    // if (this.draggingSphereIndex !== null) {
    evt.currentTarget.style.cursor = '';
    //   }
    this.draggingSphereIndex = null;
  };

  /**
   * It returns if the canvas point is near the provided crosshairs annotation in the
   * provided element or not. A proximity is passed to the function to determine the
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
    annotation: VolumeCroppingAnnotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): boolean => {
    if (this._pointNearTool(element, annotation, canvasCoords, 6)) {
      return true;
    }

    return false;
  };

  onCameraModified = (evt) => {
    const { element } = evt.currentTarget
      ? { element: evt.currentTarget }
      : evt.detail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const volumeActor = viewport.getDefaultActor()?.actor;
    if (!volumeActor) {
      console.warn('No volume actor found');
      return;
    }
    const mapper = volumeActor.getMapper();

    const clippingPlanes = mapper.getClippingPlanes();

    // console.debug('on camera modified', viewport.getActors(), clippingPlanes);
    enabledElement.viewport.render();
  };

  onResetCamera = (evt) => {
    console.debug('on reset camera');
  };

  mouseMoveCallback = (
    evt: EventTypes.MouseMoveEventType,
    filteredToolAnnotations: Annotations
  ): boolean => {
    if (!filteredToolAnnotations) {
      return;
    }
    const { element, currentPoints } = evt.detail;
    const canvasCoords = currentPoints.canvas;
    let imageNeedsUpdate = false;

    for (let i = 0; i < filteredToolAnnotations.length; i++) {
      const annotation = filteredToolAnnotations[i] as VolumeCroppingAnnotation;

      if (isAnnotationLocked(annotation.annotationUID)) {
        continue;
      }

      const { data, highlighted } = annotation;
      if (!data.handles) {
        continue;
      }

      const previousActiveOperation = data.handles.activeOperation;
      const previousActiveViewportIds =
        data.activeViewportIds && data.activeViewportIds.length > 0
          ? [...data.activeViewportIds]
          : [];

      // This init are necessary, because when we move the mouse they are not cleaned by _endCallback
      data.activeViewportIds = [];
      let near = false;
      near = this._pointNearTool(element, annotation, canvasCoords, 6);

      const nearToolAndNotMarkedActive = near && !highlighted;
      const notNearToolAndMarkedActive = !near && highlighted;
      if (nearToolAndNotMarkedActive || notNearToolAndMarkedActive) {
        annotation.highlighted = !highlighted;
        imageNeedsUpdate = true;
      }
    }

    return imageNeedsUpdate;
  };

  _onNewVolume = () => {
    const viewportsInfo = this._getViewportsInfo();

    const [viewport3D] = viewportsInfo;
    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    const viewport = renderingEngine.getViewport(viewport3D.viewportId);

    const camera = viewport.getCamera();
    viewport.setCamera({
      focalPoint: camera.focalPoint,
      position: [camera.position[0], camera.position[1], camera.position[2]],
    });
    this._initialize3DViewports(viewportsInfo);
    viewport.render();
  };

  _unsubscribeToViewportNewVolumeSet(viewportsInfo) {
    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const { viewport } = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      const { element } = viewport;

      element.removeEventListener(
        Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
        this._onNewVolume
      );
    });
  }

  _subscribeToViewportNewVolumeSet(viewports) {
    viewports.forEach(({ viewportId, renderingEngineId }) => {
      const { viewport } = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      const { element } = viewport;

      element.addEventListener(
        Enums.Events.VOLUME_VIEWPORT_NEW_VOLUME,
        this._onNewVolume
      );
    });
  }

  _activateModify = (element) => {
    // mobile sometimes has lingering interaction even when touchEnd triggers
    // this check allows for multiple handles to be active which doesn't affect
    // tool usage.
    state.isInteractingWithTool = !this.configuration.mobile?.enabled;

    element.addEventListener(Events.MOUSE_UP, this._endCallback);
    element.addEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.addEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.addEventListener(Events.TOUCH_END, this._endCallback);
    element.addEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.addEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _deactivateModify = (element) => {
    state.isInteractingWithTool = false;

    element.removeEventListener(Events.MOUSE_UP, this._endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, this._dragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, this._endCallback);

    element.removeEventListener(Events.TOUCH_END, this._endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, this._dragCallback);
    element.removeEventListener(Events.TOUCH_TAP, this._endCallback);
  };

  _endCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    console.debug(eventDetail);
    const { element } = eventDetail;

    this.editData.annotation.data.handles.activeOperation = null;
    this.editData.annotation.data.activeViewportIds = [];

    this._deactivateModify(element);

    resetElementCursor(element);

    this.editData = null;

    const requireSameOrientation = false;
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName(),
      requireSameOrientation
    );

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
  };

  _dragCallback = (evt: EventTypes.InteractionEventType) => {
    const eventDetail = evt.detail;
    const delta = eventDetail.deltaPoints.world;

    if (
      Math.abs(delta[0]) < 1e-3 &&
      Math.abs(delta[1]) < 1e-3 &&
      Math.abs(delta[2]) < 1e-3
    ) {
      return;
    }

    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine, viewport } = enabledElement;
    if (viewport.type === Enums.ViewportType.VOLUME_3D) {
      return;
    }
    const annotations = this._getAnnotations(
      enabledElement
    ) as VolumeCroppingAnnotation[];
    const filteredToolAnnotations =
      this.filterInteractableAnnotationsForElement(element, annotations);

    // viewport Annotation
    const viewportAnnotation = filteredToolAnnotations[0];
    if (!viewportAnnotation) {
      return;
    }

    const { handles } = viewportAnnotation.data;
    const { currentPoints } = evt.detail;
    const canvasCoords = currentPoints.canvas;

    if (handles.activeOperation === OPERATION.DRAG) {
      this.toolCenter[0] += delta[0];
      this.toolCenter[1] += delta[1];
      this.toolCenter[2] += delta[2];
      const viewportsInfo = this._getViewportsInfo();
      triggerAnnotationRenderForViewportIds(
        viewportsInfo.map(({ viewportId }) => viewportId)
      );
      viewport.render;
    }

    // TRANSLATION
    // get the annotation of the other viewport which are parallel to the delta shift and are of the same scene
    const otherViewportAnnotations =
      this._getAnnotationsForViewportsWithDifferentCameras(
        enabledElement,
        annotations
      );

    const viewportsAnnotationsToUpdate = otherViewportAnnotations.filter(
      (annotation) => {
        const { data } = annotation;
        const otherViewport = renderingEngine.getViewport(data.viewportId);
        const otherViewportControllable = this._getReferenceLineControllable(
          otherViewport.id
        );

        return (
          otherViewportControllable === true &&
          viewportAnnotation.data.activeViewportIds.find(
            (id) => id === otherViewport.id
          )
        );
      }
    );

    this._applyDeltaShiftToSelectedViewportCameras(
      renderingEngine,
      viewportsAnnotationsToUpdate,
      delta
    );
  };

  _pointNearTool(element, annotation, canvasCoords, proximity) {
    const { data } = annotation;

    // You must have referenceLines available in annotation.data.
    // If not, you can recompute them here or store them in renderAnnotation.
    // For this example, let's assume you store them as data.referenceLines.
    const referenceLines = data.referenceLines;

    const viewportIdArray = [];

    if (referenceLines) {
      for (let i = 0; i < referenceLines.length; ++i) {
        // Each line: [otherViewport, refLinePointOne, refLinePointTwo, refLinePointThree, refLinePointFour, ...]
        const otherViewport = referenceLines[i][0];
        // First segment
        const start1 = referenceLines[i][1];
        const end1 = referenceLines[i][2];
        // Second segment
        const start2 = referenceLines[i][3];
        const end2 = referenceLines[i][4];

        const distance1 = lineSegment.distanceToPoint(start1, end1, [
          canvasCoords[0],
          canvasCoords[1],
        ]);
        const distance2 = lineSegment.distanceToPoint(start2, end2, [
          canvasCoords[0],
          canvasCoords[1],
        ]);

        if (distance1 <= proximity || distance2 <= proximity) {
          viewportIdArray.push(otherViewport.id);
          data.handles.activeOperation = 1; // DRAG
        }
      }
    }

    data.activeViewportIds = [...viewportIdArray];

    this.editData = {
      annotation,
    };
    return data.handles.activeOperation === 1 ? true : false;
  }
}

VolumeCroppingTool.toolName = 'VolumeCroppingTool';
export default VolumeCroppingTool;
