import vtkCellPicker from '@kitware/vtk.js/Rendering/Core/CellPicker';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCylinderSource from '@kitware/vtk.js/Filters/Sources/CylinderSource';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import type vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';

import { AnnotationTool } from './base';

import type { Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  getEnabledElementByIds,
  getEnabledElement,
  utilities as csUtils,
  Enums,
  triggerEvent,
  eventTarget,
} from '@cornerstonejs/core';

import { getToolGroup } from '../store/ToolGroupManager';

import { state } from '../store/state';
import { Events } from '../enums';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import { resetElementCursor } from '../cursors/elementCursor';
import { getAnnotations } from '../stateManagement/annotation/annotationState'; // <-- Add this import

import * as lineSegment from '../utilities/math/line';
import type {
  Annotation,
  Annotations,
  EventTypes,
  ToolHandle,
  PublicToolProps,
  ToolProps,
  InteractionTypes,
  SVGDrawingHelper,
} from '../types';
import { isAnnotationLocked } from '../stateManagement/annotation/annotationLocking';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';

interface VolumeCroppingAnnotation extends Annotation {
  data: {
    handles: {
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

const PLANEINDEX = {
  XMIN: 0,
  XMAX: 1,
  YMIN: 2,
  YMAX: 3,
  ZMIN: 4,
  ZMAX: 5,
};
const SPHEREINDEX = {
  // cube faces
  XMIN: 0,
  XMAX: 1,
  YMIN: 2,
  YMAX: 3,
  ZMIN: 4,
  ZMAX: 5,
  // cube corners
  XMIN_YMIN_ZMIN: 6,
  XMIN_YMIN_ZMAX: 7,
  XMIN_YMAX_ZMIN: 8,
  XMIN_YMAX_ZMAX: 9,
  XMAX_YMIN_ZMIN: 10,
  XMAX_YMIN_ZMAX: 11,
  XMAX_YMAX_ZMIN: 12,
  XMAX_YMAX_ZMAX: 13,
};
const POINTINDEX = {
  X: 0,
  Y: 1,
  Z: 2,
};

function addCylinderBetweenPoints(
  viewport,
  point1,
  point2,
  radius = 0.5,
  color: [number, number, number] = [0.5, 0.5, 0.5],
  uid = ''
) {
  const cylinderSource = vtkCylinderSource.newInstance();
  // Compute direction and length
  const direction = [
    point2[0] - point1[0],
    point2[1] - point1[1],
    point2[2] - point1[2],
  ];
  const length = Math.sqrt(
    direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2
  );
  // Midpoint
  const center: Types.Point3 = [
    (point1[0] + point2[0]) / 2,
    (point1[1] + point2[1]) / 2,
    (point1[2] + point2[2]) / 2,
  ];
  // Default cylinder is aligned with Y axis, so compute rotation
  cylinderSource.setCenter(center[0], center[1], center[2]);
  cylinderSource.setRadius(radius);
  cylinderSource.setHeight(length);
  // Set direction (align cylinder axis with direction vector)
  cylinderSource.setDirection(direction[0], direction[1], direction[2]);

  const cylinderMapper = vtkMapper.newInstance();
  //const cylinderMapper = vtkVolumeMapper.newInstance();
  cylinderMapper.setInputConnection(cylinderSource.getOutputPort());
  const cylinderActor = vtkActor.newInstance();
  cylinderActor.setMapper(cylinderMapper);
  cylinderActor.getProperty().setColor(color);
  cylinderActor.getProperty().setInterpolationToFlat();
  cylinderActor.getProperty().setAmbient(1.0); // Full ambient
  cylinderActor.getProperty().setDiffuse(0.0); // No diffuse
  cylinderActor.getProperty().setSpecular(0.0);

  viewport.addActor({ actor: cylinderActor, uid: uid });
  return { actor: cylinderActor, source: cylinderSource };
}

/**
 * VolumeCroppingTool is a tool that provides clipping planes to crop a volume
 */
class VolumeCroppingTool extends AnnotationTool {
  static toolName;
  originalClippingPlanes: { origin: number[]; normal: number[] }[] = [];

  sphereStates: {
    point: Types.Point3;
    axis: string;
    uid: string;
    sphereSource;
    sphereActor;
    isCorner: boolean;
    color: number[]; // [r, g, b] color for the sphere
  }[] = [];
  draggingSphereIndex: number | null = null;
  toolCenter: Types.Point3 = [0, 0, 0];
  _getReferenceLineColor?: (viewportId: string) => string;
  _getReferenceLineControllable?: (viewportId: string) => boolean;
  picker: vtkCellPicker;
  edgeCylinders: {
    [uid: string]: {
      actor: vtkActor;
      source: vtkCylinderSource;
      key1: string;
      key2: string;
    };
  } = {};

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        showCornerSpheres: true,
        showHandles: true,
        mobile: {
          enabled: false,
          opacity: 0.8,
        },
        initialCropFactor: 0.2,
        sphereColors: {
          x: [1.0, 1.0, 0.0], //  Yellow for X
          y: [0.0, 1.0, 0.0], // Green for Y
          z: [1.0, 0.0, 0.0], // Red for Z
          corners: [0.0, 0.0, 1.0], // Blue for corners
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
    this.picker.setPickFromList(true);
    this.picker.setTolerance(0);
    this.picker.initializePickList();
  }

  addNewAnnotation(
    evt: EventTypes.InteractionEventType
  ): Annotation | undefined {
    // Implement your logic here if needed
    return undefined;
  }

  cancel(): void {
    // Implement your logic here if needed
  }

  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    handle: ToolHandle,
    interactionType: InteractionTypes
  ): void {
    // Implement your logic here if needed
  }

  toolSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    interactionType: InteractionTypes
  ): void {
    // Implement your logic here if needed
  }

  renderAnnotation(
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean {
    // Implement your logic here if needed
    return false;
  }

  setHandlesVisible(visible: boolean) {
    this.configuration.showHandles = visible;
    // Remove or show actors accordingly
    this._updateHandlesVisibility();
  }
  getHandlesVisible() {
    return this.configuration.showHandles;
  }
  _updateHandlesVisibility() {
    const viewportsInfo = this._getViewportsInfo();
    viewportsInfo.forEach(({ renderingEngineId, viewportId }) => {
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine.getViewport(viewportId);

      // Spheres
      this.sphereStates.forEach((state) => {
        if (state.sphereActor) {
          state.sphereActor.setVisibility(this.configuration.showHandles);
        }
      });

      // Edge cylinders
      Object.values(this.edgeCylinders).forEach(({ actor }) => {
        if (actor) {
          actor.setVisibility(this.configuration.showHandles);
        }
      });

      viewport.render();
    });
  }
  _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId).viewportsInfo;
    return viewports;
  };

  onSetToolActive() {
    const viewportsInfo = this._getViewportsInfo();
    this._unsubscribeToViewportNewVolumeSet(viewportsInfo);
    this._subscribeToViewportNewVolumeSet(viewportsInfo);
    this._initialize3DViewports(viewportsInfo);
  }

  onSetToolPassive() {
    const viewportsInfo = this._getViewportsInfo();
  }

  onSetToolEnabled() {
    const viewportsInfo = this._getViewportsInfo();
    this._initialize3DViewports(viewportsInfo);
  }

  onSetToolDisabled() {
    const viewportsInfo = this._getViewportsInfo();
    this._unsubscribeToViewportNewVolumeSet(viewportsInfo);
  }

  addSphere(viewport, point, axis, position, cornerKey = null) {
    if (!this.configuration.showHandles) {
      return;
    }
    // Generate a unique UID for each sphere based on its axis and position
    // Use cornerKey for corners, otherwise axis+position for faces
    const uid = cornerKey ? `corner_${cornerKey}` : `${axis}_${position}`;
    const sphereState = this.sphereStates.find((s) => s.uid === uid);
    if (sphereState) {
      return;
    }
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
    let color: [number, number, number] = [0.0, 1.0, 0.0]; // Default green
    const sphereColors = this.configuration.sphereColors || {};

    if (cornerKey) {
      color = sphereColors.corners || [0.0, 0.0, 1.0]; // Use corners color from config, fallback to blue
    } else if (axis === 'z') {
      color = sphereColors.z || [1.0, 0.0, 0.0];
    } else if (axis === 'x') {
      color = sphereColors.x || [1.0, 1.0, 0.0];
    } else if (axis === 'y') {
      color = sphereColors.y || [0.0, 1.0, 0.0];
    }
    // Store or update the sphere position
    const idx = this.sphereStates.findIndex((s) => s.uid === uid);
    if (idx === -1) {
      this.sphereStates.push({
        point: point.slice(),
        axis,
        uid,
        sphereSource,
        sphereActor,
        isCorner: !!cornerKey,
        color,
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
    sphereActor.getProperty().setColor(color);
    sphereActor.setPickable(true);
    viewport.addActor({ actor: sphereActor, uid: uid });
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
    const mapper = viewport
      .getDefaultActor()
      .actor.getMapper() as vtkVolumeMapper;
    planes.push(planeXmin);
    planes.push(planeXmax);
    planes.push(planeYmin);
    planes.push(planeYmax);
    planes.push(planeZmin);
    planes.push(planeZmax);

    const originalPlanes = planes.map((plane) => ({
      origin: [...plane.getOrigin()],
      normal: [...plane.getNormal()],
    }));

    this.originalClippingPlanes = originalPlanes;
    const sphereXminPoint = [xMin, (yMax + yMin) / 2, (zMax + zMin) / 2];
    const sphereXmaxPoint = [xMax, (yMax + yMin) / 2, (zMax + zMin) / 2];
    const sphereYminPoint = [(xMax + xMin) / 2, yMin, (zMax + zMin) / 2];
    const sphereYmaxPoint = [(xMax + xMin) / 2, yMax, (zMax + zMin) / 2];
    const sphereZminPoint = [(xMax + xMin) / 2, (yMax + yMin) / 2, zMin];
    const sphereZmaxPoint = [(xMax + xMin) / 2, (yMax + yMin) / 2, zMax];

    this.addSphere(viewport, sphereXminPoint, 'x', 'min');
    this.addSphere(viewport, sphereXmaxPoint, 'x', 'max');
    this.addSphere(viewport, sphereYminPoint, 'y', 'min');
    this.addSphere(viewport, sphereYmaxPoint, 'y', 'max');
    this.addSphere(viewport, sphereZminPoint, 'z', 'min');
    this.addSphere(viewport, sphereZmaxPoint, 'z', 'max');
    if (
      this.configuration.showCornerSpheres &&
      this.configuration.showHandles
    ) {
      const corners = [
        [xMin, yMin, zMin], // XMIN_YMIN_ZMIN
        [xMin, yMin, zMax], // XMIN_YMIN_ZMAX
        [xMin, yMax, zMin], // XMIN_YMAX_ZMIN
        [xMin, yMax, zMax], // XMIN_YMAX_ZMAX
        [xMax, yMin, zMin], // XMAX_YMIN_ZMIN
        [xMax, yMin, zMax], // XMAX_YMIN_ZMAX
        [xMax, yMax, zMin], // XMAX_YMAX_ZMIN
        [xMax, yMax, zMax], // XMAX_YMAX_ZMAX
      ];

      const cornerKeys = [
        'XMIN_YMIN_ZMIN',
        'XMIN_YMIN_ZMAX',
        'XMIN_YMAX_ZMIN',
        'XMIN_YMAX_ZMAX',
        'XMAX_YMIN_ZMIN',
        'XMAX_YMIN_ZMAX',
        'XMAX_YMAX_ZMIN',
        'XMAX_YMAX_ZMAX',
      ];

      for (let i = 0; i < corners.length; i++) {
        this.addSphere(viewport, corners[i], 'corner', null, cornerKeys[i]);
      }

      // draw the lines between corners
      // All 12 edges as pairs of corner keys
      const edgeCornerPairs = [
        // X edges
        ['XMIN_YMIN_ZMIN', 'XMAX_YMIN_ZMIN'],
        ['XMIN_YMIN_ZMAX', 'XMAX_YMIN_ZMAX'],
        ['XMIN_YMAX_ZMIN', 'XMAX_YMAX_ZMIN'],
        ['XMIN_YMAX_ZMAX', 'XMAX_YMAX_ZMAX'],
        // Y edges
        ['XMIN_YMIN_ZMIN', 'XMIN_YMAX_ZMIN'],
        ['XMIN_YMIN_ZMAX', 'XMIN_YMAX_ZMAX'],
        ['XMAX_YMIN_ZMIN', 'XMAX_YMAX_ZMIN'],
        ['XMAX_YMIN_ZMAX', 'XMAX_YMAX_ZMAX'],
        // Z edges
        ['XMIN_YMIN_ZMIN', 'XMIN_YMIN_ZMAX'],
        ['XMIN_YMAX_ZMIN', 'XMIN_YMAX_ZMAX'],
        ['XMAX_YMIN_ZMIN', 'XMAX_YMIN_ZMAX'],
        ['XMAX_YMAX_ZMIN', 'XMAX_YMAX_ZMAX'],
      ];

      edgeCornerPairs.forEach(([key1, key2], i) => {
        const state1 = this.sphereStates.find(
          (s) => s.uid === `corner_${key1}`
        );
        const state2 = this.sphereStates.find(
          (s) => s.uid === `corner_${key2}`
        );
        if (state1 && state2) {
          const uid = `edge_${key1}_${key2}`;
          const { actor, source } = addCylinderBetweenPoints(
            viewport,
            state1.point,
            state2.point,
            2, // radius
            [0.7, 0.7, 0.7], // color
            uid
          );
          this.edgeCylinders[uid] = { actor, source, key1, key2 };
        }
      });
    }

    const defaultActor = viewport.getDefaultActor();
    const actor = defaultActor.actor as vtkActor | vtkVolume;
    if (actor && (actor.isA?.('vtkActor') || actor.isA?.('vtkVolume'))) {
      this.picker.addPickList(actor);
      this._prepareImageDataForPicking(viewport);
    }

    const element = viewport.canvas || viewport.element;
    element.addEventListener('mousedown', this._onMouseDownSphere);
    element.addEventListener('mousemove', this._onMouseMoveSphere);
    element.addEventListener('mouseup', this._onMouseUpSphere);

    if (
      typeof mapper.addClippingPlane === 'function' &&
      typeof mapper.removeAllClippingPlanes === 'function'
    ) {
      mapper.addClippingPlane(planeXmin);
      mapper.addClippingPlane(planeXmax);
      mapper.addClippingPlane(planeYmin);
      mapper.addClippingPlane(planeYmax);
      mapper.addClippingPlane(planeZmin);
      mapper.addClippingPlane(planeZmax);
    }

    eventTarget.addEventListener(
      Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED,
      (evt) => {
        this._onControlToolChange(evt);
      }
    );
  };

  _onControlToolChange = (evt) => {
    // coronal  is y axis in green
    // sagittal is x axis in yellow
    // axial    is z axis in red
    const viewportsInfo = this._getViewportsInfo();
    const [viewport3D] = viewportsInfo;
    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    const viewport = renderingEngine.getViewport(viewport3D.viewportId);
    if (evt.detail.handleType === 'min') {
      const toolMin = evt.detail.toolCenterMin;
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
      this.originalClippingPlanes[PLANEINDEX.XMIN].origin =
        planeXmin.getOrigin();
      this.originalClippingPlanes[PLANEINDEX.YMIN].origin =
        planeYmin.getOrigin();
      this.originalClippingPlanes[PLANEINDEX.ZMIN].origin =
        planeZmin.getOrigin();
      if (this.configuration.showHandles) {
        this.sphereStates[SPHEREINDEX.XMIN].point[0] = planeXmin.getOrigin()[0];
        this.sphereStates[SPHEREINDEX.XMIN].sphereSource.setCenter(
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
          if (
            !state.isCorner &&
            state.axis !== 'x' &&
            !evt.detail.viewportOrientation.includes('sagittal') // sagittal is y axis in yellow
          ) {
            state.point[0] = newXCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereActor.getProperty().setColor(state.color);
          }
        });

        // y
        this.sphereStates[SPHEREINDEX.YMIN].point[1] = planeYmin.getOrigin()[1];
        this.sphereStates[SPHEREINDEX.YMIN].sphereSource.setCenter(
          this.sphereStates[SPHEREINDEX.YMIN].point
        );
        this.sphereStates[SPHEREINDEX.YMIN].sphereSource.modified();
        const otherYSphere = this.sphereStates.find(
          (s, i) => s.axis === 'y' && i !== SPHEREINDEX.YMIN
        );
        const newYCenter =
          (otherYSphere.point[1] + planeYmin.getOrigin()[1]) / 2;
        this.sphereStates.forEach((state, idx) => {
          if (
            !state.isCorner &&
            state.axis !== 'y' &&
            !evt.detail.viewportOrientation.includes('coronal') // coronal  is x axis in green
          ) {
            state.point[1] = newYCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereActor.getProperty().setColor(state.color);
            state.sphereSource.modified();
          }
        });
        // z
        this.sphereStates[SPHEREINDEX.ZMIN].point[2] = planeZmin.getOrigin()[2];
        this.sphereStates[SPHEREINDEX.ZMIN].sphereSource.setCenter(
          this.sphereStates[SPHEREINDEX.ZMIN].point[0],
          this.sphereStates[SPHEREINDEX.ZMIN].point[1],
          planeZmin.getOrigin()[2]
        );
        const otherZSphere = this.sphereStates.find(
          (s, i) => s.axis === 'z' && i !== SPHEREINDEX.ZMIN
        );
        const newZCenter =
          (otherZSphere.point[2] + planeZmin.getOrigin()[2]) / 2;
        this.sphereStates.forEach((state, idx) => {
          if (
            !state.isCorner &&
            state.axis !== 'z' &&
            !evt.detail.viewportOrientation.includes('axial') // axial    is z axis in red
          ) {
            state.point[2] = newZCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereActor.getProperty().setColor(state.color);
          }
        });
      }
      const volumeActor = viewport.getDefaultActor()?.actor;
      if (!volumeActor) {
        console.warn('No volume actor found');
        return;
      }
      const mapper = volumeActor.getMapper() as vtkVolumeMapper;
      const clippingPlanes = mapper.getClippingPlanes();
      clippingPlanes[PLANEINDEX.XMIN].setOrigin(planeXmin.getOrigin());
      clippingPlanes[PLANEINDEX.YMIN].setOrigin(planeYmin.getOrigin());
      clippingPlanes[PLANEINDEX.ZMIN].setOrigin(planeZmin.getOrigin());
    } else if (evt.detail.handleType === 'max') {
      const toolMax = evt.detail.toolCenterMax;
      const planeXmax = vtkPlane.newInstance({
        origin: [toolMax[0], 0, 0],
        normal: [-1, 0, 0],
      });
      const planeYmax = vtkPlane.newInstance({
        origin: [0, toolMax[1], 0],
        normal: [0, -1, 0],
      });
      const planeZmax = vtkPlane.newInstance({
        origin: [0, 0, toolMax[2]],
        normal: [0, 0, -1],
      });
      // viewport.setOriginalClippingPlane(PLANEINDEX.XMAX, planeXmax.getOrigin());
      // viewport.setOriginalClippingPlane(PLANEINDEX.YMAX, planeYmax.getOrigin());
      // viewport.setOriginalClippingPlane(PLANEINDEX.ZMAX, planeZmax.getOrigin());
      this.originalClippingPlanes[PLANEINDEX.XMAX].origin =
        planeXmax.getOrigin();
      this.originalClippingPlanes[PLANEINDEX.YMAX].origin =
        planeYmax.getOrigin();
      this.originalClippingPlanes[PLANEINDEX.ZMAX].origin =
        planeZmax.getOrigin();
      if (this.configuration.showHandles) {
        // x
        this.sphereStates[SPHEREINDEX.XMAX].point[POINTINDEX.X] =
          planeXmax.getOrigin()[POINTINDEX.X];
        this.sphereStates[SPHEREINDEX.XMAX].sphereSource.setCenter(
          this.sphereStates[SPHEREINDEX.XMAX].point[POINTINDEX.X],
          this.sphereStates[SPHEREINDEX.XMAX].point[POINTINDEX.Y],
          this.sphereStates[SPHEREINDEX.XMAX].point[POINTINDEX.Z]
        );
        this.sphereStates[SPHEREINDEX.XMAX].sphereSource.modified();
        const otherXSphere = this.sphereStates.find(
          (s, i) => s.axis === 'x' && i !== SPHEREINDEX.XMAX
        );
        const newXCenter =
          (otherXSphere.point[POINTINDEX.X] +
            planeXmax.getOrigin()[POINTINDEX.X]) /
          2;
        this.sphereStates.forEach((state, idx) => {
          if (
            !state.isCorner &&
            state.axis !== 'x' &&
            !evt.detail.viewportOrientation.includes('sagittal')
          ) {
            state.point[POINTINDEX.X] = newXCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereActor.getProperty().setColor(state.color);
            state.sphereSource.modified();
          }
        });

        // y
        this.sphereStates[SPHEREINDEX.YMAX].point[POINTINDEX.Y] =
          planeYmax.getOrigin()[POINTINDEX.Y];
        this.sphereStates[SPHEREINDEX.YMAX].sphereSource.setCenter(
          this.sphereStates[SPHEREINDEX.YMAX].point[POINTINDEX.X],
          this.sphereStates[SPHEREINDEX.YMAX].point[POINTINDEX.Y],
          this.sphereStates[SPHEREINDEX.YMAX].point[POINTINDEX.Z]
        );

        this.sphereStates[SPHEREINDEX.YMAX].sphereSource.modified();
        const otherYSphere = this.sphereStates.find(
          (s, i) => s.axis === 'y' && i !== SPHEREINDEX.YMAX
        );
        const newYCenter =
          (otherYSphere.point[POINTINDEX.Y] +
            planeYmax.getOrigin()[POINTINDEX.Y]) /
          2;
        this.sphereStates.forEach((state, idx) => {
          if (
            !state.isCorner &&
            state.axis !== 'y' &&
            !evt.detail.viewportOrientation.includes('coronal')
          ) {
            state.point[POINTINDEX.Y] = newYCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereActor.getProperty().setColor(state.color);
            state.sphereSource.modified();
          }
        });

        // z
        this.sphereStates[SPHEREINDEX.ZMAX].point[POINTINDEX.Z] =
          planeZmax.getOrigin()[POINTINDEX.Z];
        this.sphereStates[SPHEREINDEX.ZMAX].sphereSource.setCenter(
          this.sphereStates[SPHEREINDEX.ZMAX].point[POINTINDEX.X],
          this.sphereStates[SPHEREINDEX.ZMAX].point[POINTINDEX.Y],
          this.sphereStates[SPHEREINDEX.ZMAX].point[POINTINDEX.Z]
        );
        this.sphereStates[SPHEREINDEX.ZMAX].sphereSource.modified();
        const otherZSphere = this.sphereStates.find(
          (s, i) => s.axis === 'z' && i !== SPHEREINDEX.ZMAX
        );
        const newZCenter =
          (otherZSphere.point[POINTINDEX.Z] +
            planeZmax.getOrigin()[POINTINDEX.Z]) /
          2;
        this.sphereStates.forEach((state, idx) => {
          if (
            !state.isCorner &&
            state.axis !== 'z' &&
            !evt.detail.viewportOrientation.includes('axial')
          ) {
            state.point[POINTINDEX.Z] = newZCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereActor.getProperty().setColor(state.color);
            state.sphereSource.modified();
          }
        });
      }
      const volumeActor = viewport.getDefaultActor()?.actor;
      const mapper = volumeActor.getMapper() as vtkVolumeMapper;
      const clippingPlanes = mapper.getClippingPlanes();
      clippingPlanes[PLANEINDEX.XMAX].setOrigin(planeXmax.getOrigin());
      clippingPlanes[PLANEINDEX.YMAX].setOrigin(planeYmax.getOrigin());
      clippingPlanes[PLANEINDEX.ZMAX].setOrigin(planeZmax.getOrigin());
    }
    if (
      this.configuration.showHandles &&
      this.configuration.showCornerSpheres
    ) {
      this._updateCornerSpheres(viewport);
    }
    // this._updateCornerSpheres(viewport);
    viewport.render();
  };

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
    const displayCoords = (
      viewport as unknown as {
        getVtkDisplayCoords: (coords: [number, number]) => [number, number];
      }
    ).getVtkDisplayCoords([x, y]);

    // --- Remove clipping planes before picking otherwise we cannot back out of the volume
    const mapper = viewport
      .getDefaultActor()
      .actor.getMapper() as vtkVolumeMapper;
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
      const volumeActor = viewport.getDefaultActor()?.actor;
      if (!volumeActor) {
        console.warn('No volume actor found');
        return;
      }
      const mapper = volumeActor.getMapper() as vtkVolumeMapper;
      if (sphereState.isCorner) {
        // Save the old position
        const oldX = sphereState.point[0];
        const oldY = sphereState.point[1];
        const oldZ = sphereState.point[2];

        // Move the dragged corner sphere to the picked point
        sphereState.point[0] = pickedPoint[0];
        sphereState.point[1] = pickedPoint[1];
        sphereState.point[2] = pickedPoint[2];
        sphereState.sphereSource.setCenter(
          pickedPoint[0],
          pickedPoint[1],
          pickedPoint[2]
        );
        sphereState.sphereSource.modified();

        // Update all other spheres (face and corner) that shared any min/max coordinate with the old corner position
        this.sphereStates.forEach((state, idx) => {
          if (idx === this.draggingSphereIndex) {
            return;
          } // already updated

          let updated = false;
          // X
          if (Math.abs(state.point[0] - oldX) < 1e-6) {
            state.point[0] = pickedPoint[0];
            updated = true;
          }
          // Y
          if (Math.abs(state.point[1] - oldY) < 1e-6) {
            state.point[1] = pickedPoint[1];
            updated = true;
          }
          // Z
          if (Math.abs(state.point[2] - oldZ) < 1e-6) {
            state.point[2] = pickedPoint[2];
            updated = true;
          }
          if (updated) {
            state.sphereSource.setCenter(
              state.point[0],
              state.point[1],
              state.point[2]
            );
            state.sphereSource.modified();
            if (state.sphereActor && state.color) {
              state.sphereActor.getProperty().setColor(state.color);
            }
          }
        });

        // After moving the corner sphere, update all face spheres to the center between their corners

        // 1. Get all corner points
        const cornerStates = [
          this.sphereStates[SPHEREINDEX.XMIN_YMIN_ZMIN],
          this.sphereStates[SPHEREINDEX.XMIN_YMIN_ZMAX],
          this.sphereStates[SPHEREINDEX.XMIN_YMAX_ZMIN],
          this.sphereStates[SPHEREINDEX.XMIN_YMAX_ZMAX],
          this.sphereStates[SPHEREINDEX.XMAX_YMIN_ZMIN],
          this.sphereStates[SPHEREINDEX.XMAX_YMIN_ZMAX],
          this.sphereStates[SPHEREINDEX.XMAX_YMAX_ZMIN],
          this.sphereStates[SPHEREINDEX.XMAX_YMAX_ZMAX],
        ];

        const xs = cornerStates.map((s) => s.point[0]);
        const ys = cornerStates.map((s) => s.point[1]);
        const zs = cornerStates.map((s) => s.point[2]);

        const xMin = Math.min(...xs);
        const xMax = Math.max(...xs);
        const yMin = Math.min(...ys);
        const yMax = Math.max(...ys);
        const zMin = Math.min(...zs);
        const zMax = Math.max(...zs);

        // 2. Set face spheres to the center between their two corners
        this.sphereStates[SPHEREINDEX.XMIN].point = [
          xMin,
          (yMin + yMax) / 2,
          (zMin + zMax) / 2,
        ];
        this.sphereStates[SPHEREINDEX.XMAX].point = [
          xMax,
          (yMin + yMax) / 2,
          (zMin + zMax) / 2,
        ];
        this.sphereStates[SPHEREINDEX.YMIN].point = [
          (xMin + xMax) / 2,
          yMin,
          (zMin + zMax) / 2,
        ];
        this.sphereStates[SPHEREINDEX.YMAX].point = [
          (xMin + xMax) / 2,
          yMax,
          (zMin + zMax) / 2,
        ];
        this.sphereStates[SPHEREINDEX.ZMIN].point = [
          (xMin + xMax) / 2,
          (yMin + yMax) / 2,
          zMin,
        ];
        this.sphereStates[SPHEREINDEX.ZMAX].point = [
          (xMin + xMax) / 2,
          (yMin + yMax) / 2,
          zMax,
        ];

        // 3. Update sphere sources
        [
          SPHEREINDEX.XMIN,
          SPHEREINDEX.XMAX,
          SPHEREINDEX.YMIN,
          SPHEREINDEX.YMAX,
          SPHEREINDEX.ZMIN,
          SPHEREINDEX.ZMAX,
        ].forEach((idx) => {
          const s = this.sphereStates[idx];
          s.sphereSource.setCenter(s.point[0], s.point[1], s.point[2]);
          s.sphereSource.modified();
        });
        // Determine which planes are connected to this corner
        // Use the draggingSphereIndex to get the corner type
        const cornerPlaneIndices = [];
        const idx = this.draggingSphereIndex;
        if (
          idx >= SPHEREINDEX.XMIN_YMIN_ZMIN &&
          idx <= SPHEREINDEX.XMAX_YMAX_ZMAX
        ) {
          // Map corner index to plane indices
          // [XMIN, XMAX], [YMIN, YMAX], [ZMIN, ZMAX]
          const cornerMap = [
            [PLANEINDEX.XMIN, PLANEINDEX.YMIN, PLANEINDEX.ZMIN], // XMIN_YMIN_ZMIN
            [PLANEINDEX.XMIN, PLANEINDEX.YMIN, PLANEINDEX.ZMAX], // XMIN_YMIN_ZMAX
            [PLANEINDEX.XMIN, PLANEINDEX.YMAX, PLANEINDEX.ZMIN], // XMIN_YMAX_ZMIN
            [PLANEINDEX.XMIN, PLANEINDEX.YMAX, PLANEINDEX.ZMAX], // XMIN_YMAX_ZMAX
            [PLANEINDEX.XMAX, PLANEINDEX.YMIN, PLANEINDEX.ZMIN], // XMAX_YMIN_ZMIN
            [PLANEINDEX.XMAX, PLANEINDEX.YMIN, PLANEINDEX.ZMAX], // XMAX_YMIN_ZMAX
            [PLANEINDEX.XMAX, PLANEINDEX.YMAX, PLANEINDEX.ZMIN], // XMAX_YMAX_ZMIN
            [PLANEINDEX.XMAX, PLANEINDEX.YMAX, PLANEINDEX.ZMAX], // XMAX_YMAX_ZMAX
          ];
          const cornerIdx = idx - SPHEREINDEX.XMIN_YMIN_ZMIN;
          cornerPlaneIndices.push(...cornerMap[cornerIdx]);
        }

        const clippingPlanes = mapper.getClippingPlanes();
        cornerPlaneIndices.forEach((planeIdx) => {
          if (clippingPlanes && clippingPlanes[planeIdx]) {
            // Set the origin of the plane to the new corner position
            clippingPlanes[planeIdx].setOrigin(
              sphereState.point[0],
              sphereState.point[1],
              sphereState.point[2]
            );
            this.originalClippingPlanes[planeIdx].origin = [
              sphereState.point[0],
              sphereState.point[1],
              sphereState.point[2],
            ];
          }
          // update the face sphere position after the clipping plane change
        });
        this._updateCornerSpheres(viewport);

        viewport.render();

        // Optionally: trigger an event if you want to notify others
        triggerEvent(eventTarget, Events.VOLUMECROPPING_TOOL_CHANGED, {
          toolCenter: pickedPoint,
          axis: 'corner',
          draggingSphereIndex: this.draggingSphereIndex,
        });
        return;
      } else {
        // face sphere movement
        // Restrict movement to the sphere's axis only
        if (sphereState.axis === 'x') {
          newPoint[POINTINDEX.X] = pickedPoint[POINTINDEX.X];
          const otherXSphere = this.sphereStates.find(
            (s, i) => s.axis === 'x' && i !== this.draggingSphereIndex
          );
          const newXCenter =
            (otherXSphere.point[POINTINDEX.X] + pickedPoint[POINTINDEX.X]) / 2;
          this.sphereStates.forEach((state, idx) => {
            if (state.axis !== 'x' && !state.isCorner) {
              state.point[POINTINDEX.X] = newXCenter;
              state.sphereSource.setCenter(
                state.point[0],
                state.point[1],
                state.point[2]
              );
              state.sphereActor.getProperty().setColor(state.color);
              state.sphereSource.modified();
            }
          });
        } else if (sphereState.axis === 'y') {
          newPoint[POINTINDEX.Y] = pickedPoint[POINTINDEX.Y];
          const otherYSphere = this.sphereStates.find(
            (s, i) => s.axis === 'y' && i !== this.draggingSphereIndex
          );
          const newYCenter =
            (otherYSphere.point[POINTINDEX.Y] + pickedPoint[POINTINDEX.Y]) / 2;
          this.sphereStates.forEach((state, idx) => {
            if (state.axis !== 'y' && !state.isCorner) {
              state.point[POINTINDEX.Y] = newYCenter;
              state.sphereSource.setCenter(
                state.point[0],
                state.point[1],
                state.point[2]
              );
              state.sphereActor.getProperty().setColor(state.color);
              state.sphereSource.modified();
            }
          });
        } else if (sphereState.axis === 'z') {
          newPoint[POINTINDEX.Z] = pickedPoint[POINTINDEX.Z];
          const otherZSphere = this.sphereStates.find(
            (s, i) => s.axis === 'z' && i !== this.draggingSphereIndex
          );
          const newZCenter =
            (otherZSphere.point[POINTINDEX.Z] + pickedPoint[POINTINDEX.Z]) / 2;
          this.sphereStates.forEach((state, idx) => {
            if (state.axis !== 'z' && !state.isCorner) {
              //   state.point[POINTINDEX.Z] = newZCenter;
              this.sphereStates[idx].point[POINTINDEX.Z] = newZCenter;
              this.sphereStates[idx].sphereSource.setCenter(
                state.point[0],
                state.point[1],
                state.point[2]
              );
              state.sphereSource.modified();
            }
          });
        }

        this.sphereStates[this.draggingSphereIndex].point[0] = newPoint[0];
        this.sphereStates[this.draggingSphereIndex].point[1] = newPoint[1];
        this.sphereStates[this.draggingSphereIndex].point[2] = newPoint[2];

        sphereState.sphereSource.setCenter(
          newPoint[0],
          newPoint[1],
          newPoint[2]
        );
        sphereState.sphereSource.modified();

        this._updateCornerSpheres(viewport);
        const clippingPlanes = mapper.getClippingPlanes();
        clippingPlanes[this.draggingSphereIndex].setOrigin(
          newPoint[0],
          newPoint[1],
          newPoint[2]
        );
        this.originalClippingPlanes[this.draggingSphereIndex].origin = [
          newPoint[0],
          newPoint[1],
          newPoint[2],
        ];
        viewport.render();
        /// Send event with the new point
        triggerEvent(eventTarget, Events.VOLUMECROPPING_TOOL_CHANGED, {
          toolCenter: newPoint,
          axis: sphereState.axis,
          draggingSphereIndex: this.draggingSphereIndex,
        });
      }
    }
  };

  _updateCornerSpheres(viewport) {
    // Get current face sphere positions
    const xMin =
      this.sphereStates.find((s) => s.axis === 'x' && s.point[0] <= s.point[1])
        ?.point[0] ?? this.sphereStates[SPHEREINDEX.XMIN].point[0];
    const xMax =
      this.sphereStates.find((s) => s.axis === 'x' && s.point[0] > s.point[1])
        ?.point[0] ?? this.sphereStates[SPHEREINDEX.XMAX].point[0];
    const yMin =
      this.sphereStates.find((s) => s.axis === 'y' && s.point[1] <= s.point[0])
        ?.point[1] ?? this.sphereStates[SPHEREINDEX.YMIN].point[1];
    const yMax =
      this.sphereStates.find((s) => s.axis === 'y' && s.point[1] > s.point[0])
        ?.point[1] ?? this.sphereStates[SPHEREINDEX.YMAX].point[1];
    const zMin =
      this.sphereStates.find((s) => s.axis === 'z' && s.point[2] <= s.point[0])
        ?.point[2] ?? this.sphereStates[SPHEREINDEX.ZMIN].point[2];
    const zMax =
      this.sphereStates.find((s) => s.axis === 'z' && s.point[2] > s.point[0])
        ?.point[2] ?? this.sphereStates[SPHEREINDEX.ZMAX].point[2];

    // All 8 corners, with their keys
    const corners = [
      { key: 'XMIN_YMIN_ZMIN', pos: [xMin, yMin, zMin] },
      { key: 'XMIN_YMIN_ZMAX', pos: [xMin, yMin, zMax] },
      { key: 'XMIN_YMAX_ZMIN', pos: [xMin, yMax, zMin] },
      { key: 'XMIN_YMAX_ZMAX', pos: [xMin, yMax, zMax] },
      { key: 'XMAX_YMIN_ZMIN', pos: [xMax, yMin, zMin] },
      { key: 'XMAX_YMIN_ZMAX', pos: [xMax, yMin, zMax] },
      { key: 'XMAX_YMAX_ZMIN', pos: [xMax, yMax, zMin] },
      { key: 'XMAX_YMAX_ZMAX', pos: [xMax, yMax, zMax] },
    ];

    for (const corner of corners) {
      const state = this.sphereStates.find(
        (s) => s.uid === `corner_${corner.key}`
      );
      if (state) {
        // Update the sphere position and color
        state.point[0] = corner.pos[0];
        state.point[1] = corner.pos[1];
        state.point[2] = corner.pos[2];
        state.sphereSource.setCenter(
          state.point[0],
          state.point[1],
          state.point[2]
        );
        state.sphereSource.modified();
      }
    }
    // ...existing code for updating corners...

    // Update edge cylinders
    Object.values(this.edgeCylinders).forEach(({ source, key1, key2 }) => {
      const state1 = this.sphereStates.find((s) => s.uid === `corner_${key1}`);
      const state2 = this.sphereStates.find((s) => s.uid === `corner_${key2}`);
      if (state1 && state2) {
        const point1 = state1.point;
        const point2 = state2.point;
        // Compute new direction and length
        const direction = [
          point2[0] - point1[0],
          point2[1] - point1[1],
          point2[2] - point1[2],
        ];
        const length = Math.sqrt(
          direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2
        );
        const center = [
          (point1[0] + point2[0]) / 2,
          (point1[1] + point2[1]) / 2,
          (point1[2] + point2[2]) / 2,
        ];
        source.setCenter(center[0], center[1], center[2]);
        source.setHeight(length);
        source.setDirection(direction[0], direction[1], direction[2]);
        source.modified();
      }
    });
  }

  _onMouseUpSphere = (evt) => {
    evt.currentTarget.style.cursor = '';
    this.draggingSphereIndex = null;
  };

  /**
   * It returns if the canvas point is near the provided reference line annotation in the
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
    enabledElement.viewport.render();
  };

  onResetCamera = (evt) => {
    console.debug('on reset camera');
  };

  _getAnnotations = (enabledElement: Types.IEnabledElement) => {
    const { viewport } = enabledElement;
    const annotations =
      getAnnotations(this.getToolName(), viewport.element) || [];
    const viewportIds = this._getViewportsInfo().map(
      ({ viewportId }) => viewportId
    );

    // filter the annotations to only keep that are for this toolGroup
    const toolGroupAnnotations = annotations.filter((annotation) => {
      const { data } = annotation;
      return viewportIds.includes(data.viewportId);
    });

    return toolGroupAnnotations;
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
    this._initialize3DViewports(viewportsInfo);
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
    const { viewport } = enabledElement;
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
    }
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
