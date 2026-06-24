import { vec2 } from 'gl-matrix';
import vtkMath from '@kitware/vtk.js/Common/Core/Math';

import { AnnotationTool } from './base';

import type { Types } from '@cornerstonejs/core';
import {
  getRenderingEngine,
  getEnabledElementByIds,
  getEnabledElement,
  Enums,
  CONSTANTS,
  triggerEvent,
  eventTarget,
  convertColorArrayToRgbString,
} from '@cornerstonejs/core';

import { getToolGroup } from '../store/ToolGroupManager';

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
import {
  type ClippingPlane,
  NUM_CLIPPING_PLANES,
  LINE_INTERSECTION_TOLERANCE,
  POINT_PROXIMITY_THRESHOLD_PIXELS,
  copyClippingPlanes,
  getColorKeyForPlaneIndex,
  getOrientationFromNormal,
  computePlanePlaneIntersection,
  findLineBoundsIntersection,
} from '../utilities/volumeCropping';

type ReferenceLine = [
  viewport: {
    id: string;
    canvas?: HTMLCanvasElement;
    canvasToWorld?: (...args: unknown[]) => Types.Point3;
  },
  startPoint: Types.Point2,
  endPoint: Types.Point2,
  type: 'min' | 'max',
  planeIndex?: number, // 0=XMIN, 1=XMAX, 2=YMIN, 3=YMAX, 4=ZMIN, 5=ZMAX
];

interface VolumeCroppingAnnotation extends Annotation {
  data: {
    handles: {
      activeOperation: number | null; // OPERATION.DRAG, OPERATION.ROTATE, etc.
      activeType?: 'min' | 'max'; // Which plane set is being dragged
      activePlaneIndex?: number; // Which specific plane is being dragged (0-5)
      // Clipping planes stored directly - ordered as [XMIN, XMAX, YMIN, YMAX, ZMIN, ZMAX]
      clippingPlanes: ClippingPlane[];
    };
    activeViewportIds: string[]; // a list of the viewport ids connected to the reference lines being translated
    viewportId: string;
    referenceLines: ReferenceLine[]; // set in renderAnnotation
    orientation?: string; // AXIAL, CORONAL, SAGITTAL
  };
}

const OPERATION = {
  DRAG: 1,
  ROTATE: 2,
  SLAB: 3,
};

/**
 * VolumeCroppingControlTool provides interactive reference lines to modify the cropping planes
 * of the VolumeCroppingTool. It renders  reference lines across 1 to 3 orthographic viewports and allows
 * users to drag these lines to adjust volume cropping boundaries in real-time.
 *
 * @remarks
 * This tool has no standalone functionality and must be used in conjunction with a VolumeCroppingTool that will be receiving volume.
 * Messaging between this tool and the main cropping tool is handled through Cornerstone events that are validated by the series instance UID of the volume.
 * Therefore the tool does not need to be in the same tool group as the volume cropping tool and
 * multiple cropping & control instances can be used on different series in the same display.
 *
 * @example
 * ```typescript
 * // Basic setup
 * const toolGroup = ToolGroupManager.createToolGroup('myToolGroup');
 * toolGroup.addTool(VolumeCroppingControlTool.toolName);
 * toolGroup.addTool(VolumeCroppingTool.toolName);
 *
 * // Configure with custom colors and settings
 * toolGroup.setToolConfiguration(VolumeCroppingControlTool.toolName, {
 *   lineColors: {
 *     AXIAL: [1.0, 0.0, 0.0],    // Red for Z-axis planes
 *     CORONAL: [0.0, 1.0, 0.0],  // Green for Y-axis planes
 *     SAGITTAL: [1.0, 1.0, 0.0], // Yellow for X-axis planes
 *   },
 *   lineWidth: 2.0,
 *   extendReferenceLines: true,
 *   viewportIndicators: true
 * });
 *
 * // Activate the tool
 * toolGroup.setToolActive(VolumeCroppingControlTool.toolName);
 * ```
 *
 * @public
 * @class VolumeCroppingControlTool
 * @extends AnnotationTool
 *
 * @property {string} seriesInstanceUID - Frame of reference for the tool
 * @property {string} toolName - Static tool identifier: 'VolumeCroppingControl'
 * @property {ClippingPlane[]} clippingPlanes - Array of 6 clipping planes ordered as [XMIN, XMAX, YMIN, YMAX, ZMIN, ZMAX]
 * @property {Function} _getReferenceLineColor - Optional callback to determine reference line color per viewport
 * @property {Function} _getReferenceLineControllable - Optional callback to determine if reference lines are interactive per viewport
 *
 * @configuration
 * @property {boolean} viewportIndicators - Whether to show colored circle indicators in viewport corners (default: false)
 * @property {Object} viewportIndicatorsConfig - Configuration for viewport indicators
 * @property {number} viewportIndicatorsConfig.radius - Radius of indicator circles in pixels (default: 5)
 * @property {number|null} viewportIndicatorsConfig.x - X position offset, null for auto-positioning
 * @property {number|null} viewportIndicatorsConfig.y - Y position offset, null for auto-positioning
 * @property {number} viewportIndicatorsConfig.xOffset - X position as fraction of viewport width (default: 0.95)
 * @property {number} viewportIndicatorsConfig.yOffset - Y position as fraction of viewport height (default: 0.05)
 * @property {number} viewportIndicatorsConfig.circleRadius - Circle radius as fraction of diagonal length
 * @property {boolean} extendReferenceLines - Whether to extend reference lines beyond intersection points with dashed lines (default: true)
 * @property {number} initialCropFactor - Initial cropping factor as percentage of volume bounds (default: 0.2)
 * @property {Object} mobile - Mobile-specific configuration
 * @property {boolean} mobile.enabled - Enable mobile touch interactions (default: false)
 * @property {number} mobile.opacity - Opacity for mobile interactions (default: 0.8)
 * @property {Object} lineColors - Color configuration for different viewport orientations
 * @property {number[]} lineColors.AXIAL - RGB color array for Z-axis planes [r, g, b] (default: [1.0, 0.0, 0.0])
 * @property {number[]} lineColors.CORONAL - RGB color array for Y-axis planes [r, g, b] (default: [0.0, 1.0, 0.0])
 * @property {number[]} lineColors.SAGITTAL - RGB color array for X-axis planes [r, g, b] (default: [1.0, 1.0, 0.0])
 * Note: These keys use orientation names for API compatibility, but refer to volume axes (X, Y, Z), not viewport orientations.
 * @property {number[]} lineColors.UNKNOWN - RGB color array for unknown orientation lines [r, g, b] (default: [0.0, 0.0, 1.0])
 * @property {number} lineWidth - Default width of reference lines in pixels (default: 1.5)
 * @property {number} lineWidthActive - Width of reference lines when actively dragging in pixels (default: 2.5)
 * @property {number} activeLineWidth - Alias for lineWidthActive for backward compatibility

 * @events
 * @event VOLUMECROPPINGCONTROL_TOOL_CHANGED - Fired when reference lines are dragged or tool state changes
 * @event VOLUMECROPPING_TOOL_CHANGED - Listens for changes from the main VolumeCroppingTool to synchronize state
 *
 *
 * @limitations
 * - Does not function independently without VolumeCroppingTool
 * - Requires volume data to be loaded before activation
 * - Limited to orthogonal viewport orientations (axial, coronal, sagittal)l
 */
class VolumeCroppingControlTool extends AnnotationTool {
  static toolName;
  seriesInstanceUID?: string;
  clippingPlanes: ClippingPlane[] = [];
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
        extendReferenceLines: true,
        initialCropFactor: 0.2,
        mobile: {
          enabled: false,
          opacity: 0.8,
        },
        lineColors: {
          AXIAL: [1.0, 0.0, 0.0], //  Red for Z-axis planes
          CORONAL: [0.0, 1.0, 0.0], // Green for Y-axis planes
          SAGITTAL: [1.0, 1.0, 0.0], // Yellow for X-axis planes
          UNKNOWN: [0.0, 0.0, 1.0], // Blue for unknown
        },
        lineWidth: 1.5,
        lineWidthActive: 2.5,
      },
    }
  ) {
    super(toolProps, defaultToolProps);

    this._getReferenceLineColor =
      toolProps.configuration?.getReferenceLineColor ||
      (() => 'rgb(0, 200, 0)');
    this._getReferenceLineControllable =
      toolProps.configuration?.getReferenceLineControllable || (() => true);

    const viewportsInfo = getToolGroup(this.toolGroupId)?.viewportsInfo;

    eventTarget.addEventListener(
      Events.VOLUMECROPPING_TOOL_CHANGED,
      this._onSphereMoved
    );

    if (viewportsInfo && viewportsInfo.length > 0) {
      const { viewportId, renderingEngineId } = viewportsInfo[0];
      const renderingEngine = getRenderingEngine(renderingEngineId);
      if (!renderingEngine) {
        return;
      }
      const viewport = renderingEngine.getViewport(viewportId);
      if (!viewport) {
        return;
      }
      const volumeActors = viewport.getActors();
      if (!volumeActors || !volumeActors.length) {
        console.warn(
          `VolumeCroppingControlTool: No volume actors found in viewport ${viewportId}.`
        );
        return;
      }
      const imageData = volumeActors[0].actor.getMapper().getInputData();
      if (imageData) {
        this.seriesInstanceUID = imageData.seriesInstanceUID || 'unknown';
      }
    }
  }

  /**
   * Gets the camera from the viewport, and adds  annotation for the viewport
   * to the annotationManager. If any annotation is found in the annotationManager, it
   * overwrites it.
   * @param viewportInfo - The viewportInfo for the viewport
   * @returns viewPlaneNormal and center of viewport canvas in world space
   */
  initializeViewport = ({
    renderingEngineId,
    viewportId,
  }: Types.IViewportId): void => {
    if (!renderingEngineId || !viewportId) {
      console.warn(
        'VolumeCroppingControlTool: Missing renderingEngineId or viewportId'
      );
      return;
    }
    const enabledElement = getEnabledElementByIds(
      viewportId,
      renderingEngineId
    );
    if (!enabledElement) {
      return;
    }

    const { viewport } = enabledElement;

    // Update seriesInstanceUID from viewport
    const volumeActors = viewport.getActors();
    if (volumeActors && volumeActors.length > 0) {
      const imageData = volumeActors[0].actor.getMapper().getInputData();
      if (imageData) {
        this.seriesInstanceUID = imageData.seriesInstanceUID || 'unknown';
      }
    }

    const { element } = viewport;
    const { position, focalPoint } = viewport.getCamera();

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

    // Determine orientation from camera normal, fallback to viewportId string
    const orientation = getOrientationFromNormal(
      viewport.getCamera().viewPlaneNormal
    );

    const annotation = {
      highlighted: false,
      metadata: {
        cameraPosition: <Types.Point3>[...position],
        cameraFocalPoint: <Types.Point3>[...focalPoint],
        toolName: this.getToolName(),
      },
      data: {
        handles: {
          activeOperation: null, // OPERATION.DRAG, OPERATION.ROTATE, etc.
          clippingPlanes:
            this.clippingPlanes.length > 0
              ? copyClippingPlanes(this.clippingPlanes)
              : [], // Will be populated from VolumeCroppingTool
        },
        activeViewportIds: [], // a list of the viewport ids connected to the reference lines being translated
        viewportId,
        referenceLines: [], // set in renderAnnotation
        orientation,
      },
    };

    addAnnotation(annotation, element);
  };

  _getViewportsInfo = () => {
    const viewports = getToolGroup(this.toolGroupId).viewportsInfo;
    return viewports;
  };

  onSetToolInactive() {
    // Tool inactive state is managed by BaseTool
  }

  onSetToolActive() {
    const viewportsInfo = this._getViewportsInfo();

    let anyAnnotationExists = false;
    for (const vpInfo of viewportsInfo) {
      const enabledElement = getEnabledElementByIds(
        vpInfo.viewportId,
        vpInfo.renderingEngineId
      );
      const annotations = this._getAnnotations(enabledElement);
      if (annotations && annotations.length > 0) {
        anyAnnotationExists = true;
        break;
      }
    }
    if (!anyAnnotationExists) {
      this._unsubscribeToViewportNewVolumeSet(viewportsInfo);
      this._subscribeToViewportNewVolumeSet(viewportsInfo);
      // Request the volume cropping tool to send current planes
      this._initializeViewports(viewportsInfo);
      triggerEvent(eventTarget, Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED, {
        toolGroupId: this.toolGroupId,
        viewportsInfo: viewportsInfo,
        seriesInstanceUID: this.seriesInstanceUID,
      });
    } else {
      // Turn off visibility of existing annotations
      for (const vpInfo of viewportsInfo) {
        const enabledElement = getEnabledElementByIds(
          vpInfo.viewportId,
          vpInfo.renderingEngineId
        );

        if (!enabledElement) {
          continue;
        }

        const annotations = this._getAnnotations(enabledElement);
        if (annotations && annotations.length > 0) {
          annotations.forEach((annotation) => {
            removeAnnotation(annotation.annotationUID);
          });
        }

        enabledElement.viewport.render();
      }
    }
  }

  onSetToolEnabled() {
    eventTarget.addEventListener(
      Events.VOLUMECROPPING_TOOL_CHANGED,
      this._onSphereMoved
    );
  }

  onSetToolDisabled() {
    const viewportsInfo = this._getViewportsInfo();

    this._unsubscribeToViewportNewVolumeSet(viewportsInfo);

    eventTarget.removeEventListener(
      Events.VOLUMECROPPING_TOOL_CHANGED,
      this._onSphereMoved
    );

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

  resetCroppingSpheres = () => {
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

    this._initializeViewports(viewportsInfo);
  };

  _initializeViewports = (viewportsInfo: Types.IViewportId[]): void => {
    if (!viewportsInfo?.length || !viewportsInfo[0]) {
      console.warn(
        'VolumeCroppingControlTool: No valid viewportsInfo for initialization.'
      );
      return;
    }

    viewportsInfo.forEach((vpInfo) => {
      this.initializeViewport(vpInfo);
    });

    triggerAnnotationRenderForViewportIds(
      viewportsInfo.map(({ viewportId }) => viewportId)
    );
  };
  _syncWithVolumeCroppingTool(originalClippingPlanes: ClippingPlane[]) {
    if (
      !originalClippingPlanes ||
      originalClippingPlanes.length < NUM_CLIPPING_PLANES
    ) {
      return;
    }

    this.clippingPlanes = copyClippingPlanes(originalClippingPlanes);

    const viewportsInfo = this._getViewportsInfo();
    viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      if (enabledElement) {
        const annotations = this._getAnnotations(enabledElement);
        annotations.forEach((annotation) => {
          if (annotation.data?.handles) {
            annotation.data.handles.clippingPlanes = copyClippingPlanes(
              this.clippingPlanes
            );
          }
        });
      }
    });

    triggerAnnotationRenderForViewportIds(
      viewportsInfo.map(({ viewportId }) => viewportId)
    );
  }

  /**
   * addNewAnnotation is called when the user clicks on the image.
   * It does not store the annotation in the stateManager though.
   *
   * @param evt - The mouse event
   * @param interactionType - The type of interaction (e.g., mouse, touch, etc.)
   * @returns  annotation
   */

  addNewAnnotation(
    evt: EventTypes.InteractionEventType
  ): VolumeCroppingAnnotation {
    const eventDetail = evt.detail;
    const { element } = eventDetail;
    const enabledElement = getEnabledElement(element);
    const { viewport } = enabledElement;
    const annotations = this._getAnnotations(enabledElement);
    const filteredAnnotations = this.filterInteractableAnnotationsForElement(
      viewport.element,
      annotations
    );

    // Guard clause: if no interactable annotation, return null
    if (
      !filteredAnnotations ||
      filteredAnnotations.length === 0 ||
      !filteredAnnotations[0]
    ) {
      return null;
    }

    const { data } = filteredAnnotations[0];

    const viewportIdArray = [];

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
    }

    data.activeViewportIds = [...viewportIdArray];
    data.handles.activeOperation = OPERATION.DRAG;

    evt.preventDefault();

    hideElementCursor(element);

    this._activateModify(element);
    return filteredAnnotations[0];
  }

  cancel = () => {
    // Cancel operation - to be implemented if needed
  };

  /**
   * It returns if the canvas point is near the provided volume cropping annotation in the
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
    if (
      this._pointNearTool(
        element,
        annotation,
        canvasCoords,
        POINT_PROXIMITY_THRESHOLD_PIXELS
      )
    ) {
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

  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    handle: ToolHandle,
    interactionType: InteractionTypes
  ): void {
    this.toolSelectedCallback(evt, annotation, interactionType);
  }

  onResetCamera = (evt) => {
    this.resetCroppingSpheres();
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

      data.activeViewportIds = [];
      const near = this._pointNearTool(
        element,
        annotation,
        canvasCoords,
        POINT_PROXIMITY_THRESHOLD_PIXELS
      );

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
    // Use orientation property for matching
    let orientation = null;
    if (enabledElement.viewport && enabledElement.viewport.getCamera) {
      orientation = getOrientationFromNormal(
        enabledElement.viewport.getCamera().viewPlaneNormal
      );
    }

    // Filter annotations for this orientation
    const filtered = annotations.filter((annotation) => {
      if (
        annotation.data.orientation &&
        orientation &&
        annotation.data.orientation === orientation
      ) {
        return true;
      }
      return false;
    });

    return filtered;
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
    function lineIntersection2D(p1, p2, q1, q2) {
      const s1_x = p2[0] - p1[0];
      const s1_y = p2[1] - p1[1];
      const s2_x = q2[0] - q1[0];
      const s2_y = q2[1] - q1[1];
      const denom = -s2_x * s1_y + s1_x * s2_y;
      if (Math.abs(denom) < LINE_INTERSECTION_TOLERANCE) {
        return null;
      } // Parallel
      const s = (-s1_y * (p1[0] - q1[0]) + s1_x * (p1[1] - q1[1])) / denom;
      const t = (s2_x * (p1[1] - q1[1]) - s2_y * (p1[0] - q1[0])) / denom;
      if (s >= 0 && s <= 1 && t >= 0 && t <= 1) {
        return [p1[0] + t * s1_x, p1[1] + t * s1_y];
      }
      return null;
    }
    const viewportsInfo = this._getViewportsInfo();
    if (!viewportsInfo || viewportsInfo.length === 0) {
      return false;
    }
    let renderStatus = false;
    const { viewport, renderingEngine } = enabledElement;
    const { element } = viewport;
    const annotations = this._getAnnotations(enabledElement);
    const camera = viewport.getCamera();
    const filteredToolAnnotations =
      this.filterInteractableAnnotationsForElement(element, annotations);

    // viewport Annotation: use the first annotation for the current viewport
    const viewportAnnotation = filteredToolAnnotations[0];
    if (!viewportAnnotation || !viewportAnnotation.data) {
      return renderStatus;
    }

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

    const data = viewportAnnotation.data;

    let clippingPlanes = viewportAnnotation.data.handles.clippingPlanes;
    if (!clippingPlanes || clippingPlanes.length < NUM_CLIPPING_PLANES) {
      // Try to use this.clippingPlanes if annotation doesn't have them yet
      if (
        this.clippingPlanes &&
        this.clippingPlanes.length >= NUM_CLIPPING_PLANES
      ) {
        clippingPlanes = this.clippingPlanes;
        data.handles.clippingPlanes = copyClippingPlanes(this.clippingPlanes);
      } else {
        return false;
      }
    }

    const { viewPlaneNormal, focalPoint } = camera;
    const referenceLines: ReferenceLine[] = [];
    const planeTypes: Array<'min' | 'max'> = [
      'min',
      'max',
      'min',
      'max',
      'min',
      'max',
    ];

    // Draw all clipping planes as reference lines
    // PLANEINDEX: XMIN=0, XMAX=1, YMIN=2, YMAX=3, ZMIN=4, ZMAX=5
    for (let planeIndex = 0; planeIndex < NUM_CLIPPING_PLANES; planeIndex++) {
      const clippingPlane = clippingPlanes[planeIndex];

      // Compute intersection of clipping plane with viewport view plane
      const intersection = computePlanePlaneIntersection(
        clippingPlane,
        viewPlaneNormal,
        focalPoint
      );

      if (!intersection) {
        continue; // Planes are parallel, skip
      }

      // Find where the intersection line crosses viewport bounds
      const lineBounds = findLineBoundsIntersection(
        intersection.point,
        intersection.direction,
        viewport
      );

      if (!lineBounds) {
        continue;
      }

      // Create reference line for this clipping plane
      referenceLines.push([
        {
          id: viewport.id,
          canvas: viewport.canvas,
        },
        lineBounds.start,
        lineBounds.end,
        planeTypes[planeIndex],
        planeIndex,
      ]);
    }

    data.referenceLines = referenceLines;

    // Draw the reference lines
    const viewportColor = this._getReferenceLineColor(viewport.id);
    const defaultColor =
      viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)';

    referenceLines.forEach((line, lineIndex) => {
      const [otherViewport, startPoint, endPoint, type, planeIndex] = line;

      if (
        planeIndex === undefined ||
        planeIndex < 0 ||
        planeIndex >= NUM_CLIPPING_PLANES
      ) {
        return;
      }

      // Calculate intersections with other lines in this viewport
      const intersections = [];
      for (let j = 0; j < referenceLines.length; ++j) {
        if (j === lineIndex) {
          continue;
        }
        const otherLine = referenceLines[j];
        const intersection = lineIntersection2D(
          startPoint,
          endPoint,
          otherLine[1],
          otherLine[2]
        );
        if (intersection) {
          intersections.push({
            with: otherLine[3], // 'min' or 'max'
            point: intersection,
          });
        }
      }

      const colorKey = getColorKeyForPlaneIndex(planeIndex);

      const lineColors = this.configuration.lineColors || {};
      const colorArr = colorKey
        ? lineColors[colorKey] || lineColors.UNKNOWN || [1.0, 0.0, 0.0]
        : [1.0, 0.0, 0.0]; // fallback to red
      // Convert [r,g,b] to rgb string if needed
      const color = convertColorArrayToRgbString(colorArr);

      const viewportControllable = this._getReferenceLineControllable(
        otherViewport.id
      );
      const selectedViewportId = data.activeViewportIds.find(
        (id) => id === otherViewport.id
      );

      let lineWidth = this.configuration.lineWidth ?? 1.5;
      const lineActive =
        data.handles.activeOperation !== null &&
        data.handles.activeOperation === OPERATION.DRAG &&
        selectedViewportId;
      if (lineActive) {
        lineWidth = this.configuration.activeLineWidth ?? 2.5;
      }

      const lineUID = `plane_${planeIndex}`;
      if (intersections.length === 2) {
        // Draw line between intersections
        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          intersections[0].point,
          intersections[1].point,
          {
            color,
            lineWidth,
          }
        );
      } else {
        // Draw full line if no intersections
        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID,
          startPoint,
          endPoint,
          {
            color,
            lineWidth,
          }
        );
      }

      // Draw dashed extensions if configured
      if (
        this.configuration.extendReferenceLines &&
        intersections.length === 2
      ) {
        const sortedIntersections = intersections
          .map((intersection) => ({
            ...intersection,
            distance: vec2.distance(startPoint, intersection.point),
          }))
          .sort((a, b) => a.distance - b.distance);

        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID + '_dashed_before',
          startPoint,
          sortedIntersections[0].point,
          { color, lineWidth, lineDash: [4, 4] }
        );

        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          lineUID + '_dashed_after',
          sortedIntersections[1].point,
          endPoint,
          { color, lineWidth, lineDash: [4, 4] }
        );
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
        { color: defaultColor, fill: defaultColor }
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
    if (evt.detail.originalClippingPlanes) {
      this._syncWithVolumeCroppingTool(evt.detail.originalClippingPlanes);
    } else {
      if (evt.detail.seriesInstanceUID !== this.seriesInstanceUID) {
        return;
      }
      return;
    }
  };

  _onNewVolume = () => {
    const viewportsInfo = this._getViewportsInfo();
    if (viewportsInfo && viewportsInfo.length > 0) {
      const { viewportId, renderingEngineId } = viewportsInfo[0];
      const renderingEngine = getRenderingEngine(renderingEngineId);
      if (!renderingEngine) {
        return;
      }
      const viewport = renderingEngine.getViewport(viewportId);
      if (!viewport) {
        return;
      }
      const volumeActors = viewport.getActors();
      if (volumeActors.length > 0) {
        const imageData = volumeActors[0].actor.getMapper().getInputData();
        if (imageData) {
          this.seriesInstanceUID = imageData.seriesInstanceUID;
          // Clipping planes will be updated from VolumeCroppingTool via events
        }
      }
    }
    this._initializeViewports(viewportsInfo);
    triggerEvent(eventTarget, Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED, {
      toolGroupId: this.toolGroupId,
      viewportsInfo: viewportsInfo,
      seriesInstanceUID: this.seriesInstanceUID,
    });
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
    const clippingPlanes = handles.clippingPlanes;

    if (
      handles.activeOperation === OPERATION.DRAG &&
      clippingPlanes &&
      clippingPlanes.length >= NUM_CLIPPING_PLANES
    ) {
      // If we have a specific plane index, update only that plane
      if (
        handles.activePlaneIndex !== undefined &&
        handles.activePlaneIndex >= 0 &&
        handles.activePlaneIndex < NUM_CLIPPING_PLANES
      ) {
        const planeIndex = handles.activePlaneIndex;
        const plane = clippingPlanes[planeIndex];

        // Move the plane along its normal direction
        // Project delta onto the plane's normal
        const normal = plane.normal;
        const dotProd = vtkMath.dot(delta, normal);
        const moveDistance = dotProd;

        // Move origin along normal
        plane.origin[0] += normal[0] * moveDistance;
        plane.origin[1] += normal[1] * moveDistance;
        plane.origin[2] += normal[2] * moveDistance;
      } else if (handles.activeType === 'min') {
        clippingPlanes[0].origin[0] += delta[0]; // XMIN
        clippingPlanes[2].origin[1] += delta[1]; // YMIN
        clippingPlanes[4].origin[2] += delta[2]; // ZMIN
      } else if (handles.activeType === 'max') {
        clippingPlanes[1].origin[0] += delta[0]; // XMAX
        clippingPlanes[3].origin[1] += delta[1]; // YMAX
        clippingPlanes[5].origin[2] += delta[2]; // ZMAX
      }

      this.clippingPlanes = copyClippingPlanes(clippingPlanes);

      // Update all annotations with the new clipping planes
      const viewportsInfo = this._getViewportsInfo();
      viewportsInfo.forEach(({ viewportId, renderingEngineId }) => {
        const enabledElement = getEnabledElementByIds(
          viewportId,
          renderingEngineId
        );
        if (enabledElement) {
          const annotations = this._getAnnotations(enabledElement);
          annotations.forEach((annotation) => {
            if (annotation.data?.handles) {
              annotation.data.handles.clippingPlanes = copyClippingPlanes(
                this.clippingPlanes
              );
            }
          });
        }
      });

      triggerAnnotationRenderForViewportIds(
        viewportsInfo.map(({ viewportId }) => viewportId)
      );

      triggerEvent(eventTarget, Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED, {
        toolGroupId: this.toolGroupId,
        clippingPlanes: this.clippingPlanes,
        handleType: handles.activeType,
        seriesInstanceUID: this.seriesInstanceUID,
      });
    }
  };

  _pointNearTool(element, annotation, canvasCoords, proximity) {
    const { data } = annotation;

    const referenceLines = data.referenceLines;

    const viewportIdArray = [];

    if (referenceLines) {
      for (let i = 0; i < referenceLines.length; ++i) {
        const [otherViewport, startPoint, endPoint, type, planeIndex] =
          referenceLines[i];

        const distance = lineSegment.distanceToPoint(startPoint, endPoint, [
          canvasCoords[0],
          canvasCoords[1],
        ]);

        if (distance <= proximity) {
          viewportIdArray.push(otherViewport.id);
          data.handles.activeOperation = OPERATION.DRAG;
          data.handles.activeType = type;
          data.handles.activePlaneIndex = planeIndex;
        }
      }
    }

    data.activeViewportIds = [...viewportIdArray];

    this.editData = {
      annotation,
    };
    return data.handles.activeOperation === OPERATION.DRAG ? true : false;
  }
}

VolumeCroppingControlTool.toolName = 'VolumeCroppingControl';
export default VolumeCroppingControlTool;
