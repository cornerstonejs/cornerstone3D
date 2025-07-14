import { mat3, vec3 } from 'gl-matrix';

import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkSphereSource from '@kitware/vtk.js/Filters/Sources/SphereSource';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkCylinderSource from '@kitware/vtk.js/Filters/Sources/CylinderSource';
import type vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';

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

function addCylinderBetweenPoints(
  viewport,
  point1,
  point2,
  radius = 0.5,
  color: [number, number, number] = [0.5, 0.5, 0.5],
  uid = ''
) {
  // Avoid creating a cylinder if the points are the same
  if (
    point1[0] === point2[0] &&
    point1[1] === point2[1] &&
    point1[2] === point2[2]
  ) {
    return { actor: null, source: null };
  }
  const cylinderSource = vtkCylinderSource.newInstance();
  // Compute direction and length
  const direction = new Float32Array([
    point2[0] - point1[0],
    point2[1] - point1[1],
    point2[2] - point1[2],
  ]);
  const length = Math.sqrt(
    direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2
  );
  // Normalize direction vector
  const normDirection = new Float32Array([0, 0, 0]);
  vec3.normalize(normDirection, direction);

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
  cylinderSource.setDirection(
    normDirection[0],
    normDirection[1],
    normDirection[2]
  );

  const cylinderMapper = vtkMapper.newInstance();
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
  edgeCylinders: {
    [uid: string]: {
      actor: vtkActor;
      source: vtkCylinderSource;
      key1: string;
      key2: string;
    };
  } = {};
  cornerDragOffset: [number, number, number] | null = null;
  faceDragOffset: number | null = null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse'],
      configuration: {
        showCornerSpheres: false,
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
        grabSpherePixelDistance: 20, //pixels threshold for closeness to the sphere being grabbed
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
    const viewportsInfo = this._getViewportsInfo();
    const [viewport3D] = viewportsInfo;
    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    const viewport = renderingEngine.getViewport(viewport3D.viewportId);
    if (visible) {
      this._updateFaceSpheresFromCorners();
      this._updateCornerSpheres(viewport);
      this._updateClippingPlanesFromFaceSpheres(viewport);
      //   this._updateClippingPlanes(viewport);
    }
    viewport.render();
  }

  getHandlesVisible() {
    return this.configuration.showHandles;
  }

  _updateHandlesVisibility() {
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
    if (!volumeActors || volumeActors.length === 0) {
      console.warn(
        'VolumeCroppingTool: No volume actors found in the viewport.'
      );
      return;
    }
    const imageData = volumeActors[0].actor.getMapper().getInputData();
    if (!imageData) {
      console.warn('VolumeCroppingTool: No image data found for volume actor.');
      return;
    }
    const dimensions = imageData.getDimensions();
    const origin = imageData.getOrigin();
    const spacing = imageData.getSpacing(); // [xSpacing, ySpacing, zSpacing]
    const cropFactor = this.configuration.initialCropFactor || 0.2;
    const xMin = origin[0] + cropFactor * (dimensions[0] - 1) * spacing[0];
    const xMax =
      origin[0] + (1 - cropFactor) * (dimensions[0] - 1) * spacing[0];
    const yMin = origin[1] + cropFactor * (dimensions[1] - 1) * spacing[1];
    const yMax =
      origin[1] + (1 - cropFactor) * (dimensions[1] - 1) * spacing[1];
    const zMin = origin[2] + cropFactor * (dimensions[2] - 1) * spacing[2];
    const zMax =
      origin[2] + (1 - cropFactor) * (dimensions[2] - 1) * spacing[2];

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
    mapper.addClippingPlane(planeXmin);
    mapper.addClippingPlane(planeXmax);
    mapper.addClippingPlane(planeYmin);
    mapper.addClippingPlane(planeYmax);
    mapper.addClippingPlane(planeZmin);
    mapper.addClippingPlane(planeZmax);

    eventTarget.addEventListener(
      Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED,
      (evt) => {
        this._onControlToolChange(evt);
      }
    );

    const element = viewport.canvas || viewport.element;
    element.addEventListener('mousedown', this._onMouseDownSphere);
    element.addEventListener('mousemove', this._onMouseMoveSphere);
    element.addEventListener('mouseup', this._onMouseUpSphere);
  };

  _updateClippingPlanes(viewport) {
    // Get the actor and transformation matrix
    const actorEntry = viewport.getDefaultActor();
    const actor = actorEntry.actor;
    const mapper = actor.getMapper();
    const matrix = actor.getMatrix();

    // Extract rotation part for normals
    const rot: mat3 = mat3.create();
    mat3.fromMat4(rot, matrix);
    // Compute inverse transpose for normal transformation
    const normalMatrix: mat3 = mat3.create();
    mat3.invert(normalMatrix, rot);
    mat3.transpose(normalMatrix, normalMatrix);
    // Remove existing clipping planes
    const originalPlanes = this.originalClippingPlanes;
    if (!originalPlanes || !originalPlanes.length) {
      return;
    }
    mapper.removeAllClippingPlanes();
    originalPlanes.forEach((plane) => {
      const origin: Types.Point3 = [
        plane.origin[0],
        plane.origin[1],
        plane.origin[2],
      ];
      const normal: Types.Point3 = [
        plane.normal[0],
        plane.normal[1],
        plane.normal[2],
      ];

      // Transform origin (full 4x4)
      const o: Types.Point3 = [0, 0, 0];
      vec3.transformMat4(o, origin, matrix);

      const n = vec3.transformMat3([0, 0, 0], normal, normalMatrix);
      vec3.normalize(n, n);
      const planeInstance = vtkPlane.newInstance({
        origin: o,
        normal: [n[0], n[1], n[2]],
      });
      mapper.addClippingPlane(planeInstance);
    });
  }

  _onControlToolChange = (evt) => {
    const viewportsInfo = this._getViewportsInfo();
    const [viewport3D] = viewportsInfo;
    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    const viewport = renderingEngine.getViewport(viewport3D.viewportId);

    const isMin = evt.detail.handleType === 'min';
    const toolCenter = isMin
      ? evt.detail.toolCenterMin
      : evt.detail.toolCenterMax;
    const normals = isMin
      ? [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ]
      : [
          [-1, 0, 0],
          [0, -1, 0],
          [0, 0, -1],
        ];
    const planeIndices = isMin
      ? [PLANEINDEX.XMIN, PLANEINDEX.YMIN, PLANEINDEX.ZMIN]
      : [PLANEINDEX.XMAX, PLANEINDEX.YMAX, PLANEINDEX.ZMAX];
    const sphereIndices = isMin
      ? [SPHEREINDEX.XMIN, SPHEREINDEX.YMIN, SPHEREINDEX.ZMIN]
      : [SPHEREINDEX.XMAX, SPHEREINDEX.YMAX, SPHEREINDEX.ZMAX];
    const axes = ['x', 'y', 'z'];
    const orientationAxes = [
      Enums.OrientationAxis.SAGITTAL,
      Enums.OrientationAxis.CORONAL,
      Enums.OrientationAxis.AXIAL,
    ];

    // Update planes and spheres for each axis
    for (let i = 0; i < 3; ++i) {
      const origin = [0, 0, 0];
      origin[i] = toolCenter[i];
      const plane = vtkPlane.newInstance({
        origin,
        normal: normals[i],
      });
      this.originalClippingPlanes[planeIndices[i]].origin = plane.getOrigin();

      if (this.configuration.showHandles) {
        // Update face sphere
        this.sphereStates[sphereIndices[i]].point[i] = plane.getOrigin()[i];
        this.sphereStates[sphereIndices[i]].sphereSource.setCenter(
          ...this.sphereStates[sphereIndices[i]].point
        );
        this.sphereStates[sphereIndices[i]].sphereSource.modified();

        // Update center for other face spheres (not on this axis)
        const otherSphere = this.sphereStates.find(
          (s, idx) => s.axis === axes[i] && idx !== sphereIndices[i]
        );
        const newCenter = (otherSphere.point[i] + plane.getOrigin()[i]) / 2;
        this.sphereStates.forEach((state) => {
          if (
            !state.isCorner &&
            state.axis !== axes[i] &&
            !evt.detail.viewportOrientation.includes(orientationAxes[i])
          ) {
            state.point[i] = newCenter;
            state.sphereSource.setCenter(state.point);
            state.sphereActor.getProperty().setColor(state.color);
            state.sphereSource.modified();
          }
        });
      }

      // Update vtk clipping plane origin
      const volumeActor = viewport.getDefaultActor()?.actor;
      if (volumeActor) {
        const mapper = volumeActor.getMapper();
        const clippingPlanes = mapper.getClippingPlanes();
        clippingPlanes[planeIndices[i]].setOrigin(plane.getOrigin());
      }
    }

    if (
      this.configuration.showHandles &&
      this.configuration.showCornerSpheres
    ) {
      this._updateCornerSpheres(viewport);
    }
    viewport.render();
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
      if (dist < this.configuration.grabSpherePixelDistance) {
        this.draggingSphereIndex = i;
        element.style.cursor = 'grabbing';

        // --- Store offset for corners ---
        const sphereState = this.sphereStates[i];
        const mouseWorld = viewport.canvasToWorld(mouseCanvas);
        if (sphereState.isCorner) {
          this.cornerDragOffset = [
            sphereState.point[0] - mouseWorld[0],
            sphereState.point[1] - mouseWorld[1],
            sphereState.point[2] - mouseWorld[2],
          ];
          this.faceDragOffset = null;
        } else {
          // For face spheres, only store the offset along the axis of movement
          const axisIdx = { x: 0, y: 1, z: 2 }[sphereState.axis];
          this.faceDragOffset =
            sphereState.point[axisIdx] - mouseWorld[axisIdx];
          this.cornerDragOffset = null;
        }
        return;
      }
    }
    this.draggingSphereIndex = null;
    this.cornerDragOffset = null;
    this.faceDragOffset = null;
  };

  _onMouseMoveSphere = (evt) => {
    if (this.draggingSphereIndex === null) {
      return;
    }
    evt.stopPropagation();
    evt.preventDefault();

    const element = evt.currentTarget;
    const [viewport3D] = this._getViewportsInfo();
    const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
    const viewport = renderingEngine.getViewport(viewport3D.viewportId);

    // Get 2D mouse position in canvas coordinates
    const rect = element.getBoundingClientRect();
    const x = evt.clientX - rect.left;
    const y = evt.clientY - rect.top;

    // Convert canvas to world coordinates
    const world = viewport.canvasToWorld([x, y]);

    const sphereState = this.sphereStates[this.draggingSphereIndex];
    if (!sphereState) {
      return;
    }

    if (sphereState.isCorner) {
      // Move the dragged corner sphere
      let newCorner = [...world];
      if (this.cornerDragOffset) {
        newCorner = [
          world[0] + this.cornerDragOffset[0],
          world[1] + this.cornerDragOffset[1],
          world[2] + this.cornerDragOffset[2],
        ];
      }
      sphereState.point = newCorner;
      sphereState.sphereSource.setCenter(...newCorner);
      sphereState.sphereSource.modified();

      // Determine which axes are min/max for this corner
      // Example: XMIN_YMAX_ZMIN => x=min, y=max, z=min
      const cornerKey = sphereState.uid.replace('corner_', '');
      const isXMin = cornerKey.includes('XMIN');
      const isXMax = cornerKey.includes('XMAX');
      const isYMin = cornerKey.includes('YMIN');
      const isYMax = cornerKey.includes('YMAX');
      const isZMin = cornerKey.includes('ZMIN');
      const isZMax = cornerKey.includes('ZMAX');

      // Update all corners that share any min/max coordinate with this corner
      this.sphereStates.forEach((state) => {
        if (!state.isCorner || state === sphereState) {
          return;
        }
        const key = state.uid.replace('corner_', '');
        if (
          (isXMin && key.includes('XMIN')) ||
          (isXMax && key.includes('XMAX')) ||
          (isYMin && key.includes('YMIN')) ||
          (isYMax && key.includes('YMAX')) ||
          (isZMin && key.includes('ZMIN')) ||
          (isZMax && key.includes('ZMAX'))
        ) {
          // For each axis that matches, update that coordinate
          if (isXMin && key.includes('XMIN')) {
            state.point[0] = newCorner[0];
          }
          if (isXMax && key.includes('XMAX')) {
            state.point[0] = newCorner[0];
          }
          if (isYMin && key.includes('YMIN')) {
            state.point[1] = newCorner[1];
          }
          if (isYMax && key.includes('YMAX')) {
            state.point[1] = newCorner[1];
          }
          if (isZMin && key.includes('ZMIN')) {
            state.point[2] = newCorner[2];
          }
          if (isZMax && key.includes('ZMAX')) {
            state.point[2] = newCorner[2];
          }
          state.sphereSource.setCenter(...state.point);
          state.sphereSource.modified();
        }
      });

      // After updating corners, update face spheres and edge cylinders
      this._updateFaceSpheresFromCorners();
      this._updateCornerSpheres(viewport);
      this._updateClippingPlanesFromFaceSpheres(viewport);
    } else {
      // For face spheres: only update the coordinate along the face's axis
      const axis = sphereState.axis;
      const axisIdx = { x: 0, y: 1, z: 2 }[axis];
      let newValue = world[axisIdx];
      if (this.faceDragOffset !== null) {
        newValue += this.faceDragOffset;
      }
      // Only update the correct axis for the correct sphere
      this.sphereStates[this.draggingSphereIndex].point[axisIdx] = newValue;
      this.sphereStates[this.draggingSphereIndex].sphereSource.setCenter(
        ...this.sphereStates[this.draggingSphereIndex].point
      );
      this.sphereStates[this.draggingSphereIndex].sphereSource.modified();

      // After updating the face sphere, update all corners from faces
      this._updateCornerSpheresFromFaces();
      this._updateFaceSpheresFromCorners();
      this._updateCornerSpheres(viewport);
      this._updateClippingPlanesFromFaceSpheres(viewport);
    }

    viewport.render();

    triggerEvent(eventTarget, Events.VOLUMECROPPING_TOOL_CHANGED, {
      toolCenter: sphereState.point,
      axis: sphereState.isCorner ? 'corner' : sphereState.axis,
      draggingSphereIndex: this.draggingSphereIndex,
    });
  };

  _updateClippingPlanesFromFaceSpheres(viewport) {
    const mapper = viewport.getDefaultActor().actor.getMapper();
    // Update origins in originalClippingPlanes
    this.originalClippingPlanes[0].origin = [
      ...this.sphereStates[SPHEREINDEX.XMIN].point,
    ];
    this.originalClippingPlanes[1].origin = [
      ...this.sphereStates[SPHEREINDEX.XMAX].point,
    ];
    this.originalClippingPlanes[2].origin = [
      ...this.sphereStates[SPHEREINDEX.YMIN].point,
    ];
    this.originalClippingPlanes[3].origin = [
      ...this.sphereStates[SPHEREINDEX.YMAX].point,
    ];
    this.originalClippingPlanes[4].origin = [
      ...this.sphereStates[SPHEREINDEX.ZMIN].point,
    ];
    this.originalClippingPlanes[5].origin = [
      ...this.sphereStates[SPHEREINDEX.ZMAX].point,
    ];

    mapper.removeAllClippingPlanes();
    for (let i = 0; i < 6; ++i) {
      const plane = vtkPlane.newInstance({
        origin: this.originalClippingPlanes[i].origin,
        normal: this.originalClippingPlanes[i].normal,
      });
      mapper.addClippingPlane(plane);
    }
  }

  _updateCornerSpheresFromFaces() {
    // Get face sphere positions
    const xMin = this.sphereStates[SPHEREINDEX.XMIN].point[0];
    const xMax = this.sphereStates[SPHEREINDEX.XMAX].point[0];
    const yMin = this.sphereStates[SPHEREINDEX.YMIN].point[1];
    const yMax = this.sphereStates[SPHEREINDEX.YMAX].point[1];
    const zMin = this.sphereStates[SPHEREINDEX.ZMIN].point[2];
    const zMax = this.sphereStates[SPHEREINDEX.ZMAX].point[2];

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
        state.point[0] = corner.pos[0];
        state.point[1] = corner.pos[1];
        state.point[2] = corner.pos[2];
        state.sphereSource.setCenter(...state.point);
        state.sphereSource.modified();
      }
    }
  }
  _updateFaceSpheresFromCorners() {
    // Get all corner points
    const corners = [
      this.sphereStates[SPHEREINDEX.XMIN_YMIN_ZMIN].point,
      this.sphereStates[SPHEREINDEX.XMIN_YMIN_ZMAX].point,
      this.sphereStates[SPHEREINDEX.XMIN_YMAX_ZMIN].point,
      this.sphereStates[SPHEREINDEX.XMIN_YMAX_ZMAX].point,
      this.sphereStates[SPHEREINDEX.XMAX_YMIN_ZMIN].point,
      this.sphereStates[SPHEREINDEX.XMAX_YMIN_ZMAX].point,
      this.sphereStates[SPHEREINDEX.XMAX_YMAX_ZMIN].point,
      this.sphereStates[SPHEREINDEX.XMAX_YMAX_ZMAX].point,
    ];

    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const zs = corners.map((p) => p[2]);

    const xMin = Math.min(...xs),
      xMax = Math.max(...xs);
    const yMin = Math.min(...ys),
      yMax = Math.max(...ys);
    const zMin = Math.min(...zs),
      zMax = Math.max(...zs);

    // Face spheres should always be at the center of their face
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

    [
      SPHEREINDEX.XMIN,
      SPHEREINDEX.XMAX,
      SPHEREINDEX.YMIN,
      SPHEREINDEX.YMAX,
      SPHEREINDEX.ZMIN,
      SPHEREINDEX.ZMAX,
    ].forEach((idx) => {
      const s = this.sphereStates[idx];
      s.sphereSource.setCenter(...s.point);
      s.sphereSource.modified();
    });
  }

  _updateCornerSpheres(viewport) {
    // Get face sphere positions
    const xMin = this.sphereStates[SPHEREINDEX.XMIN].point[0];
    const xMax = this.sphereStates[SPHEREINDEX.XMAX].point[0];
    const yMin = this.sphereStates[SPHEREINDEX.YMIN].point[1];
    const yMax = this.sphereStates[SPHEREINDEX.YMAX].point[1];
    const zMin = this.sphereStates[SPHEREINDEX.ZMIN].point[2];
    const zMax = this.sphereStates[SPHEREINDEX.ZMAX].point[2];

    // Define all 8 corners from face sphere positions
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

    // Update corner spheres
    for (const corner of corners) {
      const state = this.sphereStates.find(
        (s) => s.uid === `corner_${corner.key}`
      );
      if (state) {
        state.point[0] = corner.pos[0];
        state.point[1] = corner.pos[1];
        state.point[2] = corner.pos[2];
        state.sphereSource.setCenter(...state.point);
        state.sphereSource.modified();
      }
    }

    // Update edge cylinders as before
    Object.values(this.edgeCylinders).forEach(({ source, key1, key2 }) => {
      const state1 = this.sphereStates.find((s) => s.uid === `corner_${key1}`);
      const state2 = this.sphereStates.find((s) => s.uid === `corner_${key2}`);
      if (state1 && state2) {
        const point1 = state1.point;
        const point2 = state2.point;
        const direction = [
          point2[0] - point1[0],
          point2[1] - point1[1],
          point2[2] - point1[2],
        ];
        const length = Math.sqrt(
          direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2
        );
        const normDirection = [0, 0, 0];
        vec3.normalize(normDirection, direction);
        const center = [
          (point1[0] + point2[0]) / 2,
          (point1[1] + point2[1]) / 2,
          (point1[2] + point2[2]) / 2,
        ];
        source.setCenter(center[0], center[1], center[2]);
        source.setHeight(length);
        source.setDirection(
          normDirection[0],
          normDirection[1],
          normDirection[2]
        );
        source.modified();
      }
    });
  }

  _onMouseUpSphere = (evt) => {
    evt.currentTarget.style.cursor = '';
    if (this.draggingSphereIndex !== null) {
      const sphereState = this.sphereStates[this.draggingSphereIndex];
      const [viewport3D] = this._getViewportsInfo();
      const renderingEngine = getRenderingEngine(viewport3D.renderingEngineId);
      const viewport = renderingEngine.getViewport(viewport3D.viewportId);

      if (sphereState.isCorner) {
        this._updateFaceSpheresFromCorners();
        this._updateCornerSpheres(viewport);
        this._updateClippingPlanesFromFaceSpheres(viewport);
      }
    }
    this.draggingSphereIndex = null;
    this.cornerDragOffset = null;
    this.faceDragOffset = null;
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
    this._updateClippingPlanes(enabledElement.viewport);
    enabledElement.viewport.render();
    console.debug('VolumeCroppingTool: Camera modified', evt);
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
