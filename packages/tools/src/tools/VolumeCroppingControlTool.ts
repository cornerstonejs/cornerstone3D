import { vec2, vec3 } from 'gl-matrix';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';
import type vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';

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

import {
  getToolGroup,
  getToolGroupForViewport,
} from '../store/ToolGroupManager';

import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../stateManagement/annotation/annotationState';

import {
  drawCircle as drawCircleSvg,
  drawLine as drawLineSvg,
} from '../drawingSvg';
import { state } from '../store/state';
import { Events } from '../enums';
import { getViewportIdsWithToolToRender } from '../utilities/viewportFilters';
import {
  resetElementCursor,
  hideElementCursor,
} from '../cursors/elementCursor';
import liangBarksyClip from '../utilities/math/vec2/liangBarksyClip';

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

const { RENDERING_DEFAULTS } = CONSTANTS;

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

/**
 * VolumeCroppingControlTool is a tool that provides reference lines between different viewports
 * of a toolGroup. Using crosshairs, you can jump to a specific location in one
 * viewport and the rest of the viewports in the toolGroup will be aligned to that location.
 *
 */
class VolumeCroppingControlTool extends AnnotationTool {
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
        referenceLinesCenterGapRadius: 20,
        initialCropFactor: 0.2,
        mobile: {
          enabled: false,
          opacity: 0.8,
        },
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

    const viewportsInfo = getToolGroup(this.toolGroupId)?.viewportsInfo;

    eventTarget.addEventListener(
      Events.VOLUMECROPPING_TOOL_CHANGED,
      this._onSphereMoved
    );

    if (viewportsInfo && viewportsInfo.length > 0) {
      const { viewportId, renderingEngineId } = viewportsInfo[0];
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine.getViewport(viewportId);
      const volumeActors = viewport.getActors();
      const imageData = volumeActors[0].actor.getMapper().getInputData();

      //   const imageData = enabledElement?.viewport?.getImageData?.();
      if (imageData) {
        const dimensions = imageData.getDimensions();
        const spacing = imageData.getSpacing();
        const origin = imageData.getOrigin();
        this.toolCenter = [
          origin[0] +
            this.configuration.initialCropFactor *
              (dimensions[0] - 1) *
              spacing[0],
          origin[1] +
            this.configuration.initialCropFactor *
              (dimensions[1] - 1) *
              spacing[1],
          origin[2] +
            this.configuration.initialCropFactor *
              (dimensions[2] - 1) *
              spacing[2],
        ];
      }
    }
  }

  /**
   * Gets the camera from the viewport, and adds  annotation for the viewport
   * to the annotationManager. If any annotation is found in the annotationManager, it
   * overwrites it.
   * @param viewportInfo - The viewportInfo for the viewport to add the crosshairs
   * @returns viewPlaneNormal and center of viewport canvas in world space
   */
  initializeViewport = ({
    renderingEngineId,
    viewportId,
  }: Types.IViewportId): {
    normal: Types.Point3;
    point: Types.Point3;
  } => {
    const enabledElement = getEnabledElementByIds(
      viewportId,
      renderingEngineId
    );
    if (!enabledElement) {
      return;
    }
    const { FrameOfReferenceUID, viewport } = enabledElement;
    const { element } = viewport;
    const { position, focalPoint, viewPlaneNormal } = viewport.getCamera();

    // Check if there is already annotation for this viewport
    let annotations = this._getAnnotations(enabledElement);
    annotations = this.filterInteractableAnnotationsForElement(
      element,
      annotations
    );

    if (annotations?.length) {
      // If found, it will override it by removing the annotation and adding it later
      removeAnnotation(annotations[0].annotationUID);
    }

    const annotation = {
      highlighted: false,
      metadata: {
        cameraPosition: <Types.Point3>[...position],
        cameraFocalPoint: <Types.Point3>[...focalPoint],
        FrameOfReferenceUID,
        toolName: this.getToolName(),
      },
      data: {
        handles: {
          toolCenter: this.toolCenter,
        },
        activeOperation: null, // 0 translation, 1 rotation handles, 2 slab thickness handles
        activeViewportIds: [], // a list of the viewport ids connected to the reference lines being translated
        viewportId,
        referenceLines: [], // set in renderAnnotation
      },
    };

    addAnnotation(annotation, element);
    return {
      normal: viewPlaneNormal,
      point: viewport.canvasToWorld([100, 100]),
    };
  };

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

    this._computeToolCenter(viewportsInfo);
  }

  onSetToolPassive() {
    const viewportsInfo = this._getViewportsInfo();

    this._computeToolCenter(viewportsInfo);
  }

  onSetToolEnabled() {
    const viewportsInfo = this._getViewportsInfo();

    this._computeToolCenter(viewportsInfo);
  }

  onSetToolDisabled() {
    const viewportsInfo = this._getViewportsInfo();

    this._unsubscribeToViewportNewVolumeSet(viewportsInfo);

    // Crosshairs annotations in the state
    // has no value when the tool is disabled
    // since viewports can change (zoom, pan, scroll)
    // between disabled and enabled/active states.
    // so we just remove the annotations from the state
    viewportsInfo.forEach(({ renderingEngineId, viewportId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );

      if (!enabledElement) {
        return;
      }

      const annotations = this._getAnnotations(enabledElement);

      if (annotations?.length) {
        annotations.forEach((annotation) => {
          removeAnnotation(annotation.annotationUID);
        });
      }
    });
  }

  resetCrosshairs = () => {
    const viewportsInfo = this._getViewportsInfo();
    for (const viewportInfo of viewportsInfo) {
      const { viewportId, renderingEngineId } = viewportInfo;
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      const viewport = enabledElement.viewport as Types.IVolumeViewport;
      const resetPan = true;
      const resetZoom = true;
      const resetToCenter = true;
      const resetRotation = true;
      const suppressEvents = true;
      viewport.resetCamera({
        resetPan,
        resetZoom,
        resetToCenter,
        resetRotation,
        suppressEvents,
      });
      (viewport as Types.IVolumeViewport).resetSlabThickness();
      const { element } = viewport;
      let annotations = this._getAnnotations(enabledElement);
      annotations = this.filterInteractableAnnotationsForElement(
        element,
        annotations
      );
      if (annotations.length) {
        removeAnnotation(annotations[0].annotationUID);
      }
      viewport.render();
    }

    this._computeToolCenter(viewportsInfo);
  };

  computeToolCenter = () => {
    const viewportsInfo = this._getViewportsInfo();
    this._computeToolCenter(viewportsInfo);
  };

  /**
   * When activated, it initializes the crosshairs. It begins by computing
   * the intersection of viewports associated with the crosshairs instance.
   * When all three views are accessible, the intersection (e.g., crosshairs tool centre)
   * will be an exact point in space; however, with two viewports, because the
   * intersection of two planes is a line, it assumes the last view is between the centre
   * of the two rendering viewports.
   * @param viewportsInfo Array of viewportInputs which each item containing `{viewportId, renderingEngineId}`
   */
  _computeToolCenter = (viewportsInfo): void => {
    // Todo: handle two same view viewport, or more than 3 viewports
    const [firstViewport, secondViewport, thirdViewport] = viewportsInfo;

    // Initialize first viewport
    const { normal: normal1, point: point1 } =
      this.initializeViewport(firstViewport);

    // Initialize second viewport
    const { normal: normal2, point: point2 } =
      this.initializeViewport(secondViewport);

    let normal3 = <Types.Point3>[0, 0, 0];
    let point3 = vec3.create();

    // If there are three viewports
    if (thirdViewport) {
      ({ normal: normal3, point: point3 } =
        this.initializeViewport(thirdViewport));
    } else {
      // If there are only two views (viewport) associated with the crosshairs:
      // In this situation, we don't have a third information to find the
      // exact intersection, and we "assume" the third view is looking at
      // a location in between the first and second view centers
      vec3.add(point3, point1, point2);
      vec3.scale(point3, point3, 0.5);
      vec3.cross(normal3, normal1, normal2);
    }

    // Planes of each viewport
    const firstPlane = csUtils.planar.planeEquation(normal1, point1);
    const secondPlane = csUtils.planar.planeEquation(normal2, point2);
    const thirdPlane = csUtils.planar.planeEquation(normal3, point3);

    //viewport.render();
    const toolCenter = csUtils.planar.threePlaneIntersection(
      firstPlane,
      secondPlane,
      thirdPlane
    );

    // this.setToolCenter(toolCenter);
  };

  setToolCenter(toolCenter: Types.Point3, suppressEvents = false): void {
    // prettier-ignore
    this.toolCenter = toolCenter;
    const viewportsInfo = this._getViewportsInfo();

    // assuming all viewports are in the same rendering engine
    triggerAnnotationRenderForViewportIds(
      viewportsInfo.map(({ viewportId }) => viewportId)
    );
    if (!suppressEvents) {
      console.log('event sent: ', Events.CROSSHAIR_TOOL_CENTER_CHANGED);
      triggerEvent(eventTarget, Events.CROSSHAIR_TOOL_CENTER_CHANGED, {
        toolGroupId: this.toolGroupId,
        toolCenter: this.toolCenter,
      });
      triggerEvent(eventTarget, Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED, {
        // orientation: viewport.defaultOptions.orientation,
        toolGroupId: this.toolGroupId,
        toolCenter: this.toolCenter,
        toolMin: this.toolCenter,
        //   viewportId: data.viewportId,
      });
    }
  }

  /**
   * addNewAnnotation is called when the user clicks on the image.
   * It does not store the annotation in the stateManager though.
   *
   * @param evt - The mouse event
   * @param interactionType - The type of interaction (e.g., mouse, touch, etc.)
   * @returns  annotation
   */

  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): VolumeCroppingAnnotation => {
    const eventDetail = evt.detail;

    console.debug('addNewAnnotation: ', eventDetail);
    const { element } = eventDetail;

    const { currentPoints } = eventDetail;
    const jumpWorld = currentPoints.world;

    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;

    //this._jump(enabledElement, jumpWorld);

    const annotations = this._getAnnotations(enabledElement);
    const filteredAnnotations = this.filterInteractableAnnotationsForElement(
      viewport.element,
      annotations
    );

    const { data } = filteredAnnotations[0];

    const viewportIdArray = [];
    // put all the draggable reference lines in the viewportIdArray

    const referenceLines = data.referenceLines || [];
    for (let i = 0; i < referenceLines.length; ++i) {
      const otherViewport = referenceLines[i][0];
      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.id
      );

      if (!viewportControllable) {
        continue;
      }
      viewportIdArray.push(otherViewport.id);
      i++;
    }

    data.activeViewportIds = [...viewportIdArray];
    // set translation operation
    data.handles.activeOperation = OPERATION.DRAG;

    evt.preventDefault();

    hideElementCursor(element);

    this._activateModify(element);
    return filteredAnnotations[0];
  };

  cancel = () => {
    console.log('Not implemented yet');
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

  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    interactionType: InteractionTypes
  ): void => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    annotation.highlighted = true;
    this._activateModify(element);

    hideElementCursor(element);

    evt.preventDefault();
  };

  onCameraModified = (evt) => {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { renderingEngine } = enabledElement;
    const viewport = enabledElement.viewport as Types.IVolumeViewport;

    const annotations = this._getAnnotations(enabledElement);
    const filteredToolAnnotations =
      this.filterInteractableAnnotationsForElement(element, annotations);

    // viewport that the camera modified is originating from
    const viewportAnnotation =
      filteredToolAnnotations[0] as VolumeCroppingAnnotation;

    if (!viewportAnnotation) {
      return;
    }

    // -- Update the camera of other linked viewports containing the same volumeId that
    //    have the same camera in case of translation
    // -- Update the crosshair center in world coordinates in annotation.
    // This is necessary because other tools can modify the position of the slices,
    // e.g. stackScroll tool at wheel scroll. So we update the coordinates of the center always here.
    // NOTE: rotation and slab thickness handles are created/updated in renderTool.
    const currentCamera = viewport.getCamera();
    const oldCameraPosition = viewportAnnotation.metadata.cameraPosition;
    const deltaCameraPosition: Types.Point3 = [0, 0, 0];
    vtkMath.subtract(
      currentCamera.position,
      oldCameraPosition,
      deltaCameraPosition
    );

    const oldCameraFocalPoint = viewportAnnotation.metadata.cameraFocalPoint;
    const deltaCameraFocalPoint: Types.Point3 = [0, 0, 0];
    vtkMath.subtract(
      currentCamera.focalPoint,
      oldCameraFocalPoint,
      deltaCameraFocalPoint
    );

    // updated cached "previous" camera position and focal point
    viewportAnnotation.metadata.cameraPosition = [...currentCamera.position];
    viewportAnnotation.metadata.cameraFocalPoint = [
      ...currentCamera.focalPoint,
    ];

    const viewportControllable = this._getReferenceLineControllable(
      viewport.id
    );

    if (
      !csUtils.isEqual(currentCamera.position, oldCameraPosition, 1e-3) &&
      viewportControllable
    ) {
      // Is camera Modified a TRANSLATION or ROTATION?
      let isRotation = false;

      // This is guaranteed to be the same diff for both position and focal point
      // if the camera is modified by pan, zoom, or scroll BUT for rotation of
      // crosshairs handles it will be different.
      const cameraModifiedSameForPosAndFocalPoint = csUtils.isEqual(
        deltaCameraPosition,
        deltaCameraFocalPoint,
        1e-3
      );

      // NOTE: it is a translation if the the focal point and camera position shifts are the same
      if (!cameraModifiedSameForPosAndFocalPoint) {
        isRotation = true;
      }

      const cameraModifiedInPlane =
        Math.abs(
          vtkMath.dot(deltaCameraPosition, currentCamera.viewPlaneNormal)
        ) < 1e-2;

      // TRANSLATION
      // NOTE1: if the camera modified is a result of a pan or zoom don't update the crosshair center
      // NOTE2: rotation handles are updates in renderTool
      if (!isRotation && !cameraModifiedInPlane) {
        this.toolCenter[0] += deltaCameraPosition[0];
        this.toolCenter[1] += deltaCameraPosition[1];
        this.toolCenter[2] += deltaCameraPosition[2];
        // triggerEvent(eventTarget, Events.CROSSHAIR_TOOL_CENTER_CHANGED, {
        //   toolGroupId: this.toolGroupId,
        //    toolCenter: this.toolCenter,
        //   });
      }
      triggerEvent(eventTarget, Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED, {
        toolGroupId: this.toolGroupId,
        toolCenter: this.toolCenter,
        viewportOrientation: [
          viewportAnnotation.data.referenceLines[0][0].options.orientation,
          viewportAnnotation.data.referenceLines[1][0].options.orientation,
        ],
      });
    }

    // AutoPan modification
    if (this.configuration.autoPan?.enabled) {
      const toolGroup = getToolGroupForViewport(
        viewport.id,
        renderingEngine.id
      );

      const otherViewportIds = toolGroup
        .getViewportIds()
        .filter((id) => id !== viewport.id);

      otherViewportIds.forEach((viewportId) => {
        this._autoPanViewportIfNecessary(viewportId, renderingEngine);
      });
    }

    const requireSameOrientation = false;
    const viewportIdsToRender = getViewportIdsWithToolToRender(
      element,
      this.getToolName(),
      requireSameOrientation
    );

    triggerAnnotationRenderForViewportIds(viewportIdsToRender);
  };

  onResetCamera = (evt) => {
    this.resetCrosshairs();
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

  filterInteractableAnnotationsForElement = (element, annotations) => {
    if (!annotations || !annotations.length) {
      return [];
    }

    const enabledElement = getEnabledElement(element);
    const { viewportId } = enabledElement;
    const viewportUIDSpecificCrosshairs = annotations.filter(
      (annotation) => annotation.data.viewportId === viewportId
    );

    return viewportUIDSpecificCrosshairs;
  };

  /**
   * renders the volume cropping lines and handles in the requestAnimationFrame callback
   *
   * @param enabledElement - The Cornerstone's enabledElement.
   * @param svgDrawingHelper - The svgDrawingHelper providing the context for drawing.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    let renderStatus = false;
    const { viewport, renderingEngine } = enabledElement;
    const { element } = viewport;
    const annotations = this._getAnnotations(enabledElement);
    const camera = viewport.getCamera();
    const filteredToolAnnotations =
      this.filterInteractableAnnotationsForElement(element, annotations);

    // viewport Annotation
    const viewportAnnotation = filteredToolAnnotations[0];
    if (!annotations?.length || !viewportAnnotation?.data) {
      // No annotations yet, and didn't just create it as we likely don't have a FrameOfReference/any data loaded yet.
      return renderStatus;
    }
    //console.debug(viewportAnnotation);

    const annotationUID = viewportAnnotation.annotationUID;

    // Get cameras/canvases for each of these.
    // -- Get two world positions for this canvas in this line (e.g. the diagonal)
    // -- Convert these world positions to this canvas.
    // -- Extend/confine this line to fit in this canvas.
    // -- Render this line.
    const { clientWidth, clientHeight } = viewport.canvas;
    const canvasDiagonalLength = Math.sqrt(
      clientWidth * clientWidth + clientHeight * clientHeight
    );
    const canvasMinDimensionLength = Math.min(clientWidth, clientHeight);

    const data = viewportAnnotation.data;
    //  console.debug('annotation data: ', data.viewportId);

    const crosshairCenterCanvas = viewport.worldToCanvas(this.toolCenter);

    const otherViewportAnnotations =
      this._filterAnnotationsByUniqueViewportOrientations(
        enabledElement,
        annotations
      );

    const referenceLines = [];

    // get canvas information for points and lines (canvas box, canvas horizontal distances)
    const canvasBox = [0, 0, clientWidth, clientHeight];

    otherViewportAnnotations.forEach((annotation) => {
      const { data } = annotation;

      data.handles.toolCenter = this.toolCenter;

      const otherViewport = renderingEngine.getViewport(
        data.viewportId
      ) as Types.IVolumeViewport;

      const otherCamera = otherViewport.getCamera();

      const otherViewportControllable = this._getReferenceLineControllable(
        otherViewport.id
      );

      // get coordinates for the reference line
      const { clientWidth, clientHeight } = otherViewport.canvas;
      const otherCanvasDiagonalLength = Math.sqrt(
        clientWidth * clientWidth + clientHeight * clientHeight
      );
      const otherCanvasCenter: Types.Point2 = [
        clientWidth * 0.5,
        clientHeight * 0.5,
      ];
      const otherViewportCenterWorld =
        otherViewport.canvasToWorld(otherCanvasCenter);

      const direction: Types.Point3 = [0, 0, 0];
      vtkMath.cross(
        camera.viewPlaneNormal,
        otherCamera.viewPlaneNormal,
        direction
      );
      vtkMath.normalize(direction);
      vtkMath.multiplyScalar(
        <Types.Point3>direction,
        otherCanvasDiagonalLength
      );

      const pointWorld0: Types.Point3 = [0, 0, 0];
      vtkMath.add(otherViewportCenterWorld, direction, pointWorld0);

      const pointWorld1: Types.Point3 = [0, 0, 0];
      vtkMath.subtract(otherViewportCenterWorld, direction, pointWorld1);

      const pointCanvas0 = viewport.worldToCanvas(pointWorld0);

      const otherViewportCenterCanvas = viewport.worldToCanvas(
        otherViewportCenterWorld
      );

      const canvasUnitVectorFromCenter = vec2.create();
      vec2.subtract(
        canvasUnitVectorFromCenter,
        pointCanvas0,
        otherViewportCenterCanvas
      );
      vec2.normalize(canvasUnitVectorFromCenter, canvasUnitVectorFromCenter);

      const canvasVectorFromCenterLong = vec2.create();

      vec2.scale(
        canvasVectorFromCenterLong,
        canvasUnitVectorFromCenter,
        canvasDiagonalLength * 100
      );
      const canvasVectorFromCenterStart = vec2.create();
      const centerGap = this.configuration.referenceLinesCenterGapRadius;
      vec2.scale(
        canvasVectorFromCenterStart,
        canvasUnitVectorFromCenter,
        // Don't put a gap if the the third view is missing
        otherViewportAnnotations.length === 2 ? centerGap : 0
      );

      // Computing Reference start and end (4 lines per viewport in case of 3 view MPR)
      const refLinePointTwo = vec2.create();
      const refLinePointFour = vec2.create();

      let refLinesCenter = vec2.clone(crosshairCenterCanvas);
      if (!otherViewportControllable) {
        refLinesCenter = vec2.clone(otherViewportCenterCanvas);
      }
      vec2.add(refLinePointTwo, refLinesCenter, canvasVectorFromCenterLong);
      vec2.subtract(
        refLinePointFour,
        refLinesCenter,
        canvasVectorFromCenterLong
      );

      // Clipping lines to be only included in a box (canvas), we don't want
      // the lines goes beyond canvas
      liangBarksyClip(refLinePointTwo, refLinePointFour, canvasBox);
      referenceLines.push([
        otherViewport,
        refLinePointTwo,
        //   refLinePointTwo,
        refLinePointFour,
        //    refLinePointFour,
      ]);
      //console.debug(refLinePointTwo, refLinePointFour);
    });

    ///  create new reference lines here

    data.referenceLines = referenceLines;

    const viewportColor = this._getReferenceLineColor(viewport.id);
    const color =
      viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)';

    referenceLines.forEach((line, lineIndex) => {
      // get color for the reference line
      const otherViewport = line[0];
      const viewportColor = this._getReferenceLineColor(otherViewport.id);
      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.id
      );
      const selectedViewportId = data.activeViewportIds.find(
        (id) => id === otherViewport.id
      );

      const color =
        viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)';

      let lineWidth = 1;

      const lineActive =
        data.handles.activeOperation !== null &&
        data.handles.activeOperation === OPERATION.DRAG &&
        selectedViewportId;

      if (lineActive) {
        lineWidth = 2.5;
      }

      let lineUID = `${lineIndex}`;
      if (viewportControllable) {
        lineUID = `${lineIndex}One`;
        lineUID = `${lineIndex}Two`;
        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          line[1],
          line[2],
          {
            color,
            lineWidth,
          }
        );
      }

      if (viewportControllable) {
        color =
          viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)';
        if (lineActive) {
          const handleUID = `${lineIndex}`;
        }
      }
    });

    renderStatus = true;

    if (this.configuration.viewportIndicators) {
      const { viewportIndicatorsConfig } = this.configuration;
      const xOffset = viewportIndicatorsConfig?.xOffset || 0.95;
      const yOffset = viewportIndicatorsConfig?.yOffset || 0.05;
      const referenceColorCoordinates = [
        clientWidth * xOffset,
        clientHeight * yOffset,
      ];

      const circleRadius =
        viewportIndicatorsConfig?.circleRadius || canvasDiagonalLength * 0.01;

      const circleUID = '0';
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        circleUID,
        referenceColorCoordinates as Types.Point2,
        circleRadius,
        { color, fill: color }
      );
    }

    return renderStatus;
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

  _onSphereMoved = (evt) => {
    if ([0, 2, 4].includes(evt.detail.draggingSphereIndex)) {
      // only update for min spheres
      let newCenter = [0, 0, 0];
      const eventCenter = evt.detail.toolCenter;
      if (evt.detail.axis === 'x') {
        newCenter = [eventCenter[0], this.toolCenter[1], this.toolCenter[2]];
      } else if (evt.detail.axis === 'y') {
        newCenter = [this.toolCenter[0], eventCenter[1], this.toolCenter[2]];
      } else if (evt.detail.axis === 'z') {
        newCenter = [this.toolCenter[0], this.toolCenter[1], eventCenter[2]];
      }
      this.setToolCenter(newCenter, true);
    }
  };

  _onNewVolume = () => {
    const viewportsInfo = this._getViewportsInfo();
    if (viewportsInfo && viewportsInfo.length > 0) {
      const { viewportId, renderingEngineId } = viewportsInfo[0];
      const renderingEngine = getRenderingEngine(renderingEngineId);
      const viewport = renderingEngine.getViewport(viewportId);
      const volumeActors = viewport.getActors();
      if (volumeActors.length > 0) {
        const imageData = volumeActors[0].actor.getMapper().getInputData();
        if (imageData) {
          const dimensions = imageData.getDimensions();
          const spacing = imageData.getSpacing();
          const origin = imageData.getOrigin();
          this.toolCenter = [
            origin[0] +
              this.configuration.initialCropFactor *
                (dimensions[0] - 1) *
                spacing[0],
            origin[1] +
              this.configuration.initialCropFactor *
                (dimensions[1] - 1) *
                spacing[1],
            origin[2] +
              this.configuration.initialCropFactor *
                (dimensions[2] - 1) *
                spacing[2],
          ];
          // Update all annotations' handles.toolCenter
          const annotations = getAnnotations(this.getToolName()) || [];
          annotations.forEach((annotation) => {
            if (annotation.data && annotation.data.handles) {
              annotation.data.handles.toolCenter = [...this.toolCenter];
            }
          });
        }
      }
    }
    this._computeToolCenter(viewportsInfo);
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

  _autoPanViewportIfNecessary(
    viewportId: string,
    renderingEngine: Types.IRenderingEngine
  ): void {
    // 1. Check if the toolCenter is outside the viewport
    // 2. If it is outside, pan the viewport to fit in the toolCenter

    const viewport = renderingEngine.getViewport(viewportId);
    const { clientWidth, clientHeight } = viewport.canvas;

    const toolCenterCanvas = viewport.worldToCanvas(this.toolCenter);

    const visiblePointCanvas = <Types.Point2>[
      toolCenterCanvas[0],
      toolCenterCanvas[1],
    ];

    if (toolCenterCanvas[0] < 0) {
      visiblePointCanvas[0] = pan;
    } else if (toolCenterCanvas[0] > clientWidth) {
      visiblePointCanvas[0] = clientWidth - pan;
    }

    if (toolCenterCanvas[1] < 0) {
      visiblePointCanvas[1] = pan;
    } else if (toolCenterCanvas[1] > clientHeight) {
      visiblePointCanvas[1] = clientHeight - pan;
    }

    if (
      visiblePointCanvas[0] === toolCenterCanvas[0] &&
      visiblePointCanvas[1] === toolCenterCanvas[1]
    ) {
      return;
    }

    const visiblePointWorld = viewport.canvasToWorld(visiblePointCanvas);

    const deltaPointsWorld = [
      visiblePointWorld[0] - this.toolCenter[0],
      visiblePointWorld[1] - this.toolCenter[1],
      visiblePointWorld[2] - this.toolCenter[2],
    ];

    const camera = viewport.getCamera();
    const { focalPoint, position } = camera;

    const updatedPosition = <Types.Point3>[
      position[0] - deltaPointsWorld[0],
      position[1] - deltaPointsWorld[1],
      position[2] - deltaPointsWorld[2],
    ];

    const updatedFocalPoint = <Types.Point3>[
      focalPoint[0] - deltaPointsWorld[0],
      focalPoint[1] - deltaPointsWorld[1],
      focalPoint[2] - deltaPointsWorld[2],
    ];

    viewport.setCamera({
      focalPoint: updatedFocalPoint,
      position: updatedPosition,
    });

    viewport.render();
  }

  _areViewportIdArraysEqual = (viewportIdArrayOne, viewportIdArrayTwo) => {
    if (viewportIdArrayOne.length !== viewportIdArrayTwo.length) {
      return false;
    }

    viewportIdArrayOne.forEach((id) => {
      let itemFound = false;
      for (let i = 0; i < viewportIdArrayTwo.length; ++i) {
        if (id === viewportIdArrayTwo[i]) {
          itemFound = true;
          break;
        }
      }
      if (itemFound === false) {
        return false;
      }
    });

    return true;
  };

  // It filters the viewports with crosshairs and only return viewports
  // that have different camera.
  _getAnnotationsForViewportsWithDifferentCameras = (
    enabledElement,
    annotations
  ) => {
    const { viewportId, renderingEngine, viewport } = enabledElement;

    const otherViewportAnnotations = annotations.filter(
      (annotation) => annotation.data.viewportId !== viewportId
    );

    if (!otherViewportAnnotations || !otherViewportAnnotations.length) {
      return [];
    }

    const camera = viewport.getCamera();
    const { viewPlaneNormal, position } = camera;

    const viewportsWithDifferentCameras = otherViewportAnnotations.filter(
      (annotation) => {
        const { viewportId } = annotation.data;
        const targetViewport = renderingEngine.getViewport(viewportId);
        const cameraOfTarget = targetViewport.getCamera();

        return !(
          csUtils.isEqual(
            cameraOfTarget.viewPlaneNormal,
            viewPlaneNormal,
            1e-2
          ) && csUtils.isEqual(cameraOfTarget.position, position, 1)
        );
      }
    );

    return viewportsWithDifferentCameras;
  };

  _filterViewportWithSameOrientation = (
    enabledElement,
    referenceAnnotation,
    annotations
  ) => {
    const { renderingEngine } = enabledElement;
    const { data } = referenceAnnotation;
    const viewport = renderingEngine.getViewport(data.viewportId);

    const linkedViewportAnnotations = annotations.filter((annotation) => {
      const { data } = annotation;
      const otherViewport = renderingEngine.getViewport(data.viewportId);
      const otherViewportControllable = this._getReferenceLineControllable(
        otherViewport.id
      );

      return otherViewportControllable === true;
    });

    if (!linkedViewportAnnotations || !linkedViewportAnnotations.length) {
      return [];
    }

    const camera = viewport.getCamera();
    const viewPlaneNormal = camera.viewPlaneNormal;
    vtkMath.normalize(viewPlaneNormal);

    const otherViewportsAnnotationsWithSameCameraDirection =
      linkedViewportAnnotations.filter((annotation) => {
        const { viewportId } = annotation.data;
        const otherViewport = renderingEngine.getViewport(viewportId);
        const otherCamera = otherViewport.getCamera();
        const otherViewPlaneNormal = otherCamera.viewPlaneNormal;
        vtkMath.normalize(otherViewPlaneNormal);

        return (
          csUtils.isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) &&
          csUtils.isEqual(camera.viewUp, otherCamera.viewUp, 1e-2)
        );
      });

    return otherViewportsAnnotationsWithSameCameraDirection;
  };

  _filterAnnotationsByUniqueViewportOrientations = (
    enabledElement,
    annotations
  ) => {
    const { renderingEngine, viewport } = enabledElement;
    const camera = viewport.getCamera();
    const viewPlaneNormal = camera.viewPlaneNormal;
    vtkMath.normalize(viewPlaneNormal);

    const otherLinkedViewportAnnotationsFromSameScene = annotations.filter(
      (annotation) => {
        const { data } = annotation;
        const otherViewport = renderingEngine.getViewport(data.viewportId);
        const otherViewportControllable = this._getReferenceLineControllable(
          otherViewport.id
        );
        // Filter out 3D viewports
        if (otherViewport.type === Enums.ViewportType.VOLUME_3D) {
          return false;
        }

        return (
          viewport !== otherViewport &&
          // scene === otherScene &&
          otherViewportControllable === true
        );
      }
    );

    const otherViewportsAnnotationsWithUniqueCameras = [];
    // Iterate first on other viewport from the same scene linked
    for (
      let i = 0;
      i < otherLinkedViewportAnnotationsFromSameScene.length;
      ++i
    ) {
      const annotation = otherLinkedViewportAnnotationsFromSameScene[i];
      const { viewportId } = annotation.data;
      const otherViewport = renderingEngine.getViewport(viewportId);
      const otherCamera = otherViewport.getCamera();
      const otherViewPlaneNormal = otherCamera.viewPlaneNormal;
      vtkMath.normalize(otherViewPlaneNormal);

      if (
        csUtils.isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) ||
        csUtils.isOpposite(viewPlaneNormal, otherViewPlaneNormal, 1e-2)
      ) {
        continue;
      }

      let cameraFound = false;
      for (
        let jj = 0;
        jj < otherViewportsAnnotationsWithUniqueCameras.length;
        ++jj
      ) {
        const annotation = otherViewportsAnnotationsWithUniqueCameras[jj];
        const { viewportId } = annotation.data;
        const stockedViewport = renderingEngine.getViewport(viewportId);
        const cameraOfStocked = stockedViewport.getCamera();

        if (
          csUtils.isEqual(
            cameraOfStocked.viewPlaneNormal,
            otherCamera.viewPlaneNormal,
            1e-2
          ) &&
          csUtils.isEqual(cameraOfStocked.position, otherCamera.position, 1)
        ) {
          cameraFound = true;
        }
      }

      if (!cameraFound) {
        otherViewportsAnnotationsWithUniqueCameras.push(annotation);
      }
    }

    const otherNonLinkedViewportAnnotationsFromSameScene = annotations.filter(
      (annotation) => {
        const { data } = annotation;
        const otherViewport = renderingEngine.getViewport(data.viewportId);
        const otherViewportControllable = this._getReferenceLineControllable(
          otherViewport.id
        );

        return (
          viewport !== otherViewport &&
          // scene === otherScene &&
          otherViewportControllable !== true
        );
      }
    );

    // Iterate second on other viewport from the same scene non linked
    for (
      let i = 0;
      i < otherNonLinkedViewportAnnotationsFromSameScene.length;
      ++i
    ) {
      const annotation = otherNonLinkedViewportAnnotationsFromSameScene[i];
      const { viewportId } = annotation.data;
      const otherViewport = renderingEngine.getViewport(viewportId);

      const otherCamera = otherViewport.getCamera();
      const otherViewPlaneNormal = otherCamera.viewPlaneNormal;
      vtkMath.normalize(otherViewPlaneNormal);

      if (
        csUtils.isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) ||
        csUtils.isOpposite(viewPlaneNormal, otherViewPlaneNormal, 1e-2)
      ) {
        continue;
      }

      let cameraFound = false;
      for (
        let jj = 0;
        jj < otherViewportsAnnotationsWithUniqueCameras.length;
        ++jj
      ) {
        const annotation = otherViewportsAnnotationsWithUniqueCameras[jj];
        const { viewportId } = annotation.data;
        const stockedViewport = renderingEngine.getViewport(viewportId);
        const cameraOfStocked = stockedViewport.getCamera();

        if (
          csUtils.isEqual(
            cameraOfStocked.viewPlaneNormal,
            otherCamera.viewPlaneNormal,
            1e-2
          ) &&
          csUtils.isEqual(cameraOfStocked.position, otherCamera.position, 1)
        ) {
          cameraFound = true;
        }
      }

      if (!cameraFound) {
        otherViewportsAnnotationsWithUniqueCameras.push(annotation);
      }
    }

    // Iterate on all the viewport
    const otherViewportAnnotations =
      this._getAnnotationsForViewportsWithDifferentCameras(
        enabledElement,
        annotations
      );

    for (let i = 0; i < otherViewportAnnotations.length; ++i) {
      const annotation = otherViewportAnnotations[i];
      if (
        otherViewportsAnnotationsWithUniqueCameras.some(
          (element) => element === annotation
        )
      ) {
        continue;
      }

      const { viewportId } = annotation.data;
      const otherViewport = renderingEngine.getViewport(viewportId);
      const otherCamera = otherViewport.getCamera();
      const otherViewPlaneNormal = otherCamera.viewPlaneNormal;
      vtkMath.normalize(otherViewPlaneNormal);

      if (
        csUtils.isEqual(viewPlaneNormal, otherViewPlaneNormal, 1e-2) ||
        csUtils.isOpposite(viewPlaneNormal, otherViewPlaneNormal, 1e-2)
      ) {
        continue;
      }

      let cameraFound = false;
      for (
        let jj = 0;
        jj < otherViewportsAnnotationsWithUniqueCameras.length;
        ++jj
      ) {
        const annotation = otherViewportsAnnotationsWithUniqueCameras[jj];
        const { viewportId } = annotation.data;
        const stockedViewport = renderingEngine.getViewport(viewportId);
        const cameraOfStocked = stockedViewport.getCamera();

        if (
          csUtils.isEqual(
            cameraOfStocked.viewPlaneNormal,
            otherCamera.viewPlaneNormal,
            1e-2
          ) &&
          csUtils.isEqual(cameraOfStocked.position, otherCamera.position, 1)
        ) {
          cameraFound = true;
        }
      }

      if (!cameraFound) {
        otherViewportsAnnotationsWithUniqueCameras.push(annotation);
      }
    }

    return otherViewportsAnnotationsWithUniqueCameras;
  };

  _checkIfViewportsRenderingSameScene = (viewport, otherViewport) => {
    const volumeIds = viewport.getAllVolumeIds();
    const otherVolumeIds = otherViewport.getAllVolumeIds();

    return (
      volumeIds.length === otherVolumeIds.length &&
      volumeIds.every((id) => otherVolumeIds.includes(id))
    );
  };

  _jump = (enabledElement, jumpWorld) => {
    state.isInteractingWithTool = true;
    const { viewport, renderingEngine } = enabledElement;

    const annotations = this._getAnnotations(enabledElement);

    const delta: Types.Point3 = [0, 0, 0];
    vtkMath.subtract(jumpWorld, this.toolCenter, delta);

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

        const sameScene = this._checkIfViewportsRenderingSameScene(
          viewport,
          otherViewport
        );

        return (
          this._getReferenceLineControllable(otherViewport.id) && sameScene
        );
      }
    );

    if (viewportsAnnotationsToUpdate.length === 0) {
      state.isInteractingWithTool = false;
      return false;
    }

    this._applyDeltaShiftToSelectedViewportCameras(
      renderingEngine,
      viewportsAnnotationsToUpdate,
      delta
    );

    state.isInteractingWithTool = false;

    return true;
  };

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
    //   console.debug(eventDetail);
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

  _applyDeltaShiftToSelectedViewportCameras(
    renderingEngine,
    viewportsAnnotationsToUpdate,
    delta
  ) {
    // update camera for the other viewports.
    // NOTE1: The lines then are rendered by the onCameraModified
    // NOTE2: crosshair center are automatically updated in the onCameraModified event
    viewportsAnnotationsToUpdate.forEach((annotation) => {
      this._applyDeltaShiftToViewportCamera(renderingEngine, annotation, delta);
    });
  }

  _applyDeltaShiftToViewportCamera(
    renderingEngine: Types.IRenderingEngine,
    annotation,
    delta
  ) {
    // update camera for the other viewports.
    // NOTE1: The lines then are rendered by the onCameraModified
    // NOTE2: crosshair center are automatically updated in the onCameraModified event
    const { data } = annotation;

    const viewport = renderingEngine.getViewport(data.viewportId);
    const camera = viewport.getCamera();
    const normal = camera.viewPlaneNormal;

    // Project delta over camera normal
    // (we don't need to pan, we need only to scroll the camera as in the wheel stack scroll tool)
    const dotProd = vtkMath.dot(delta, normal);
    const projectedDelta: Types.Point3 = [...normal];
    vtkMath.multiplyScalar(projectedDelta, dotProd);

    if (
      Math.abs(projectedDelta[0]) > 1e-3 ||
      Math.abs(projectedDelta[1]) > 1e-3 ||
      Math.abs(projectedDelta[2]) > 1e-3
    ) {
      const newFocalPoint: Types.Point3 = [0, 0, 0];
      const newPosition: Types.Point3 = [0, 0, 0];

      vtkMath.add(camera.focalPoint, projectedDelta, newFocalPoint);
      vtkMath.add(camera.position, projectedDelta, newPosition);

      viewport.setCamera({
        focalPoint: newFocalPoint,
        position: newPosition,
      });
      viewport.render();
    }
  }

  _pointNearTool(element, annotation, canvasCoords, proximity) {
    const { data } = annotation;

    // You must have referenceLines available in annotation.data.
    // If not, you can recompute them here or store them in renderAnnotation.
    // For this example, let's assume you store them as data.referenceLines.
    const referenceLines = data.referenceLines;

    const viewportIdArray = [];

    if (referenceLines) {
      for (let i = 0; i < referenceLines.length; ++i) {
        // Each line: [otherViewport, refLinePointOne, refLinePointTwo, ...]
        const otherViewport = referenceLines[i][0];
        // First segment
        const start1 = referenceLines[i][1];
        const end1 = referenceLines[i][2];

        const distance1 = lineSegment.distanceToPoint(start1, end1, [
          canvasCoords[0],
          canvasCoords[1],
        ]);

        if (distance1 <= proximity) {
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

VolumeCroppingControlTool.toolName = 'VolumeCroppingControlTool';
export default VolumeCroppingControlTool;
