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

// Clipping plane structure (matches VolumeCroppingTool)
type ClippingPlane = {
  origin: Types.Point3;
  normal: Types.Point3;
};

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
  isVirtual?: boolean;
  virtualNormal?: Types.Point3;
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
 * @property {VolumeCroppingAnnotation[]} _virtualAnnotations - Store virtual annotations for missing viewport orientations (e.g., CT_CORONAL when only axial and sagittal are present)
 * @property {string} toolName - Static tool identifier: 'VolumeCroppingControl'
 * @property {Array<SphereState>} sphereStates - Array of sphere state objects for 3D volume manipulation handles
 * @property {number|null} draggingSphereIndex - Index of currently dragged sphere, null when not dragging
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
  // Store virtual annotations (e.g., for missing orientations like CT_CORONAL)
  _virtualAnnotations: VolumeCroppingAnnotation[] = [];
  static toolName;
  seriesInstanceUID?: string;
  sphereStates: {
    point: Types.Point3;
    axis: string;
    uid: string;
    sphereSource;
    sphereActor;
  }[] = [];
  draggingSphereIndex: number | null = null;
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
      if (!volumeActors || !volumeActors.length) {
        console.warn(
          `VolumeCroppingControlTool: No volume actors found in viewport ${viewportId}.`
        );
        return;
      }
      const imageData = volumeActors[0].actor.getMapper().getInputData();
      if (imageData) {
        const dimensions = imageData.getDimensions();
        const spacing = imageData.getSpacing();
        const origin = imageData.getOrigin();
        this.seriesInstanceUID = imageData.seriesInstanceUID || 'unknown';
        // Clipping planes will be initialized from VolumeCroppingTool via events
      }
    }
  }

  _updateToolCentersFromViewport(viewport) {
    const volumeActors = viewport.getActors();
    if (!volumeActors || !volumeActors.length) {
      return;
    }
    const imageData = volumeActors[0].actor.getMapper().getInputData();
    if (!imageData) {
      return;
    }
    this.seriesInstanceUID = imageData.seriesInstanceUID || 'unknown';
    // Clipping planes will be initialized from VolumeCroppingTool via events
  }

  /**
   * Helper to extract min/max bounds from clipping planes
   * PLANEINDEX: XMIN=0, XMAX=1, YMIN=2, YMAX=3, ZMIN=4, ZMAX=5
   */
  _getBoundsFromClippingPlanes(planes: ClippingPlane[]): {
    min: Types.Point3;
    max: Types.Point3;
  } {
    if (!planes || planes.length < 6) {
      return { min: [0, 0, 0], max: [0, 0, 0] };
    }

    return {
      min: [
        planes[0].origin[0], // XMIN
        planes[2].origin[1], // YMIN
        planes[4].origin[2], // ZMIN
      ],
      max: [
        planes[1].origin[0], // XMAX
        planes[3].origin[1], // YMAX
        planes[5].origin[2], // ZMAX
      ],
    };
  }

  /**
   * Helper to get center point from clipping planes (if needed for virtual viewports)
   */
  _getCenterFromClippingPlanes(planes: ClippingPlane[]): Types.Point3 {
    const { min, max } = this._getBoundsFromClippingPlanes(planes);
    return [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ];
  }

  /**
   * Computes the intersection line between a clipping plane and the viewport's view plane.
   * Returns the direction vector and a point on the intersection line.
   */
  _computePlanePlaneIntersection(
    clippingPlane: ClippingPlane,
    viewPlaneNormal: Types.Point3,
    viewPlanePoint: Types.Point3
  ): { direction: Types.Point3; point: Types.Point3 } | null {
    const n1 = clippingPlane.normal;
    const p1 = clippingPlane.origin;
    const n2 = viewPlaneNormal;
    const p2 = viewPlanePoint;

    const dir = vec3.create();
    vec3.cross(dir, n1, n2);
    const dirLenSq = vec3.squaredLength(dir);

    if (dirLenSq < 1e-10) {
      return null; // planes effectively parallel
    }

    const d1 = vtkMath.dot(n1, p1);
    const d2 = vtkMath.dot(n2, p2);

    // point = (d1 (n2 × dir) + d2 (dir × n1)) / |dir|^2
    const term1 = vec3.create();
    const term2 = vec3.create();
    vec3.cross(term1, n2, dir);
    vec3.scale(term1, term1, d1);
    vec3.cross(term2, dir, n1);
    vec3.scale(term2, term2, d2);

    const point = vec3.create();
    vec3.add(point, term1, term2);
    vec3.scale(point, point, 1 / dirLenSq);

    if (
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1]) ||
      !Number.isFinite(point[2])
    ) {
      return null;
    }

    const direction = vec3.create();
    vec3.scale(direction, dir, 1 / Math.sqrt(dirLenSq));

    return {
      direction: direction as Types.Point3,
      point: point as Types.Point3,
    };
  }

  /**
   * Finds where an intersection line crosses the viewport bounds.
   * Returns two points on the line that are within the viewport bounds.
   */
  _findLineBoundsIntersection(
    linePoint: Types.Point3,
    lineDirection: Types.Point3,
    viewport: Types.IViewport,
    viewPlaneNormal: Types.Point3
  ): { start: Types.Point2; end: Types.Point2 } | null {
    // Extend line far in both directions
    const lineLength = 100000; // Large distance to ensure we cross viewport
    const lineStart: Types.Point3 = [
      linePoint[0] - lineDirection[0] * lineLength,
      linePoint[1] - lineDirection[1] * lineLength,
      linePoint[2] - lineDirection[2] * lineLength,
    ];
    const lineEnd: Types.Point3 = [
      linePoint[0] + lineDirection[0] * lineLength,
      linePoint[1] + lineDirection[1] * lineLength,
      linePoint[2] + lineDirection[2] * lineLength,
    ];

    // Project two points on the line to canvas coordinates
    let canvasStart: Types.Point2;
    let canvasEnd: Types.Point2;
    try {
      canvasStart = viewport.worldToCanvas(lineStart);
      canvasEnd = viewport.worldToCanvas(lineEnd);
      console.log(
        `[VolumeCroppingControlTool] _findLineBoundsIntersection: canvasStart:`,
        canvasStart,
        `canvasEnd:`,
        canvasEnd
      );
    } catch (error) {
      console.log(
        `[VolumeCroppingControlTool] _findLineBoundsIntersection: worldToCanvas failed:`,
        error
      );
      return null;
    }

    // Get viewport dimensions
    const { clientWidth, clientHeight } = viewport.canvas;

    // Clip to canvas bounds
    const canvasBox = [0, 0, clientWidth, clientHeight];
    const clippedStart = vec2.clone(canvasStart);
    const clippedEnd = vec2.clone(canvasEnd);

    console.log(
      `[VolumeCroppingControlTool] _findLineBoundsIntersection: Before clipping - start: [${clippedStart[0]}, ${clippedStart[1]}], end: [${clippedEnd[0]}, ${clippedEnd[1]}], canvasBox: [${canvasBox[0]}, ${canvasBox[1]}, ${canvasBox[2]}, ${canvasBox[3]}]`
    );

    // Check if line is valid before clipping
    const startValid = !isNaN(clippedStart[0]) && !isNaN(clippedStart[1]);
    const endValid = !isNaN(clippedEnd[0]) && !isNaN(clippedEnd[1]);
    if (!startValid || !endValid) {
      console.log(
        `[VolumeCroppingControlTool] _findLineBoundsIntersection: Invalid canvas coordinates before clipping`
      );
      return null;
    }

    const clipResult = liangBarksyClip(clippedStart, clippedEnd, canvasBox);

    console.log(
      `[VolumeCroppingControlTool] _findLineBoundsIntersection: After clipping - start: [${clippedStart[0]}, ${clippedStart[1]}], end: [${clippedEnd[0]}, ${clippedEnd[1]}], clipResult: ${clipResult}`
    );

    // Check if line actually intersects the viewport bounds
    // liangBarksyClip returns 1 (INSIDE) if line intersects, 0 (OUTSIDE) if it doesn't
    if (clipResult === 0) {
      console.log(
        `[VolumeCroppingControlTool] _findLineBoundsIntersection: Line does not intersect viewport bounds`
      );
      return null;
    }

    // Check if clipped line is still valid
    const clippedStartValid =
      !isNaN(clippedStart[0]) && !isNaN(clippedStart[1]);
    const clippedEndValid = !isNaN(clippedEnd[0]) && !isNaN(clippedEnd[1]);
    if (!clippedStartValid || !clippedEndValid) {
      console.log(
        `[VolumeCroppingControlTool] _findLineBoundsIntersection: Invalid coordinates after clipping`
      );
      return null;
    }

    // Verify that clipped coordinates are actually within the viewport bounds
    const [xMin, yMin, xMax, yMax] = canvasBox;
    const startInBounds =
      clippedStart[0] >= xMin - 1 &&
      clippedStart[0] <= xMax + 1 &&
      clippedStart[1] >= yMin - 1 &&
      clippedStart[1] <= yMax + 1;
    const endInBounds =
      clippedEnd[0] >= xMin - 1 &&
      clippedEnd[0] <= xMax + 1 &&
      clippedEnd[1] >= yMin - 1 &&
      clippedEnd[1] <= yMax + 1;

    if (!startInBounds || !endInBounds) {
      console.log(
        `[VolumeCroppingControlTool] _findLineBoundsIntersection: Clipped coordinates outside viewport bounds. start: [${clippedStart[0]}, ${clippedStart[1]}], end: [${clippedEnd[0]}, ${clippedEnd[1]}], bounds: [${xMin}, ${yMin}, ${xMax}, ${yMax}]`
      );
      return null;
    }

    // Check if the line has zero length after clipping
    const dx = clippedEnd[0] - clippedStart[0];
    const dy = clippedEnd[1] - clippedStart[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1) {
      console.log(
        `[VolumeCroppingControlTool] Line too short after clipping: ${length}, start: [${clippedStart[0]}, ${clippedStart[1]}], end: [${clippedEnd[0]}, ${clippedEnd[1]}]`
      );
      return null; // Line is too short to draw
    }

    return {
      start: [clippedStart[0], clippedStart[1]] as Types.Point2,
      end: [clippedEnd[0], clippedEnd[1]] as Types.Point2,
    };
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
  }: Types.IViewportId): {
    normal: Types.Point3;
    point: Types.Point3;
  } => {
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
    this._updateToolCentersFromViewport(viewport);
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

    // Determine orientation from camera normal, fallback to viewportId string
    const orientation = this._getOrientationFromNormal(
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
              ? this.clippingPlanes.map((p) => ({
                  origin: [...p.origin] as Types.Point3,
                  normal: [...p.normal] as Types.Point3,
                }))
              : [], // Will be populated from VolumeCroppingTool
        },
        activeViewportIds: [], // a list of the viewport ids connected to the reference lines being translated
        viewportId,
        referenceLines: [], // set in renderAnnotation
        orientation,
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

  onSetToolInactive() {
    console.debug(
      `VolumeCroppingControlTool: onSetToolInactive called for tool ${this.getToolName()}`
    );
  }

  onSetToolActive() {
    // console.debug(
    //   `VolumeCroppingControlTool: onSetToolActive called for tool ${this.getToolName()}`
    // );
    const viewportsInfo = this._getViewportsInfo();

    // Check if any annotation exists before proceeding
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
      this._computeToolCenter(viewportsInfo);
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

        // Render after removing annotations to clear reference lines
        enabledElement.viewport.render();
      }
    }
  }

  onSetToolEnabled() {
    console.debug(
      `VolumeCroppingControlTool: onSetToolEnabled called for tool ${this.getToolName()}`
    );
    const viewportsInfo = this._getViewportsInfo();

    //this._computeToolCenter(viewportsInfo);
  }

  onSetToolDisabled() {
    console.debug(
      `VolumeCroppingControlTool: onSetToolDisabled called for tool ${this.getToolName()}`
    );
    const viewportsInfo = this._getViewportsInfo();

    this._unsubscribeToViewportNewVolumeSet(viewportsInfo);

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

    this._computeToolCenter(viewportsInfo);
  };

  computeToolCenter = () => {
    const viewportsInfo = this._getViewportsInfo();
  };

  _computeToolCenter = (viewportsInfo): void => {
    if (!viewportsInfo || !viewportsInfo[0]) {
      console.warn(
        '  _computeToolCenter : No valid viewportsInfo for computeToolCenter.'
      );
      return;
    }
    // Support any missing orientation
    const orientationIds = ['AXIAL', 'CORONAL', 'SAGITTAL'];
    // Get present orientations from viewportsInfo
    const presentOrientations = viewportsInfo
      .map((vp) => {
        if (vp.renderingEngineId) {
          const renderingEngine = getRenderingEngine(vp.renderingEngineId);
          const viewport = renderingEngine.getViewport(vp.viewportId);
          if (viewport && viewport.getCamera) {
            const orientation = this._getOrientationFromNormal(
              viewport.getCamera().viewPlaneNormal
            );
            if (orientation) {
              return orientation;
            }
          }
        }
        return null;
      })
      .filter(Boolean);

    const missingOrientation = orientationIds.find(
      (id) => !presentOrientations.includes(id)
    );

    // Initialize present viewports

    const presentNormals: Types.Point3[] = [];
    const presentCenters: Types.Point3[] = [];
    // Find present viewport infos by matching orientation, not viewportId
    const presentViewportInfos = viewportsInfo.filter((vp) => {
      let orientation = null;
      if (vp.renderingEngineId) {
        const renderingEngine = getRenderingEngine(vp.renderingEngineId);
        const viewport = renderingEngine.getViewport(vp.viewportId);
        if (viewport && viewport.getCamera) {
          orientation = this._getOrientationFromNormal(
            viewport.getCamera().viewPlaneNormal
          );
        }
      }
      return orientation && orientationIds.includes(orientation);
    });
    presentViewportInfos.forEach((vpInfo) => {
      const { normal, point } = this.initializeViewport(vpInfo);
      presentNormals.push(normal);
      presentCenters.push(point);
    });

    // If all three orientations are present, nothing to synthesize
    if (presentViewportInfos.length === 2 && missingOrientation) {
      // Synthesize virtual annotation for the missing orientation
      const virtualNormal: Types.Point3 = [0, 0, 0];
      vec3.cross(virtualNormal, presentNormals[0], presentNormals[1]);
      vec3.normalize(virtualNormal, virtualNormal);
      const virtualCenter: Types.Point3 = [
        (presentCenters[0][0] + presentCenters[1][0]) / 2,
        (presentCenters[0][1] + presentCenters[1][1]) / 2,
        (presentCenters[0][2] + presentCenters[1][2]) / 2,
      ];
      const orientation = null;
      const virtualAnnotation: VolumeCroppingAnnotation = {
        highlighted: false,
        metadata: {
          cameraPosition: <Types.Point3>[...virtualCenter],
          cameraFocalPoint: <Types.Point3>[...virtualCenter],
          toolName: this.getToolName(),
        },
        data: {
          handles: {
            activeOperation: null,
            clippingPlanes:
              this.clippingPlanes.length > 0
                ? this.clippingPlanes.map((p) => ({
                    origin: [...p.origin] as Types.Point3,
                    normal: [...p.normal] as Types.Point3,
                  }))
                : [],
          },
          activeViewportIds: [],
          viewportId: missingOrientation,
          referenceLines: [],
          orientation,
        },
        isVirtual: true,
        virtualNormal,
      };
      this._virtualAnnotations = [virtualAnnotation];
    } else if (presentViewportInfos.length === 1) {
      // Synthesize two virtual annotations for the two missing orientations
      // Get present orientation from camera normal
      let presentOrientation = null;
      const vpInfo = presentViewportInfos[0];
      if (vpInfo.renderingEngineId) {
        const renderingEngine = getRenderingEngine(vpInfo.renderingEngineId);
        const viewport = renderingEngine.getViewport(vpInfo.viewportId);
        if (viewport && viewport.getCamera) {
          presentOrientation = this._getOrientationFromNormal(
            viewport.getCamera().viewPlaneNormal
          );
        }
      }
      const presentCenter = presentCenters[0];
      // Map canonical normals to orientation strings
      const canonicalNormals = {
        AXIAL: [0, 0, 1],
        CORONAL: [0, 1, 0],
        SAGITTAL: [1, 0, 0],
      };
      // missingIds: AXIAL, CORONAL, SAGITTAL
      const missingIds = orientationIds.filter(
        (id) => id !== presentOrientation
      );
      const virtualAnnotations: VolumeCroppingAnnotation[] = missingIds.map(
        (orientation) => {
          // Use orientation string to get canonical normal
          const normal = canonicalNormals[orientation];
          const virtualAnnotation = {
            highlighted: false,
            metadata: {
              cameraPosition: <Types.Point3>[...presentCenter],
              cameraFocalPoint: <Types.Point3>[...presentCenter],
              toolName: this.getToolName(),
            },
            data: {
              handles: {
                activeOperation: null,
                clippingPlanes:
                  this.clippingPlanes.length > 0
                    ? this.clippingPlanes.map((p) => ({
                        origin: [...p.origin] as Types.Point3,
                        normal: [...p.normal] as Types.Point3,
                      }))
                    : [],
              },
              activeViewportIds: [],
              viewportId: orientation, // Use orientation string for virtual annotation
              referenceLines: [],
              orientation,
            },
            isVirtual: true,
            virtualNormal: normal,
          };

          return virtualAnnotation;
        }
      );
      this._virtualAnnotations = virtualAnnotations;
    }

    if (viewportsInfo && viewportsInfo.length) {
      triggerAnnotationRenderForViewportIds(
        viewportsInfo.map(({ viewportId }) => viewportId)
      );
    }
  };
  /**
   * Utility function to map a camera normal to an orientation string.
   * Returns 'AXIAL', 'CORONAL', 'SAGITTAL', or null if not matched.
   */
  _getOrientationFromNormal(normal: Types.Point3): string | null {
    if (!normal) {
      return null;
    }
    // Canonical normals
    const canonical = {
      AXIAL: [0, 0, 1],
      CORONAL: [0, 1, 0],
      SAGITTAL: [1, 0, 0],
    };
    // Use a tolerance for floating point comparison
    const tol = 1e-2;
    for (const [key, value] of Object.entries(canonical)) {
      if (
        Math.abs(normal[0] - value[0]) < tol &&
        Math.abs(normal[1] - value[1]) < tol &&
        Math.abs(normal[2] - value[2]) < tol
      ) {
        return key;
      }
      // Also check negative direction
      if (
        Math.abs(normal[0] + value[0]) < tol &&
        Math.abs(normal[1] + value[1]) < tol &&
        Math.abs(normal[2] + value[2]) < tol
      ) {
        return key;
      }
    }
    return null;
  }
  _syncWithVolumeCroppingTool(originalClippingPlanes: ClippingPlane[]) {
    if (!originalClippingPlanes || originalClippingPlanes.length < 6) {
      return;
    }

    // Store clipping planes directly
    this.clippingPlanes = originalClippingPlanes.map((plane) => ({
      origin: [...plane.origin] as Types.Point3,
      normal: [...plane.normal] as Types.Point3,
    }));

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
            annotation.data.handles.clippingPlanes = this.clippingPlanes.map(
              (p) => ({
                origin: [...p.origin] as Types.Point3,
                normal: [...p.normal] as Types.Point3,
              })
            );
          }
        });
      }
    });

    // Update virtual annotations
    if (this._virtualAnnotations?.length > 0) {
      this._virtualAnnotations.forEach((annotation) => {
        if (annotation.data?.handles) {
          annotation.data.handles.clippingPlanes = this.clippingPlanes.map(
            (p) => ({
              origin: [...p.origin] as Types.Point3,
              normal: [...p.normal] as Types.Point3,
            })
          );
        }
      });
    }

    // Trigger re-render to show updated reference lines
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
  }

  cancel = () => {
    console.log('Not implemented yet');
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

  handleSelectedCallback(
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    handle: ToolHandle,
    interactionType: InteractionTypes
  ): void {
    // You can customize this logic as needed
    // For now, just call toolSelectedCallback if you want default behavior
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
    // Use orientation property for matching
    let orientation = null;
    if (enabledElement.viewport && enabledElement.viewport.getCamera) {
      orientation = this._getOrientationFromNormal(
        enabledElement.viewport.getCamera().viewPlaneNormal
      );
    }

    // Filter annotations for this orientation, including virtual annotations
    const filtered = annotations.filter((annotation) => {
      // Always include virtual annotations for reference line rendering
      if (annotation.isVirtual) {
        return true;
      }
      // Match by orientation property
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
    console.log('[VolumeCroppingControlTool] renderAnnotation called', {
      viewportId: enabledElement.viewport.id,
    });

    function lineIntersection2D(p1, p2, q1, q2) {
      const s1_x = p2[0] - p1[0];
      const s1_y = p2[1] - p1[1];
      const s2_x = q2[0] - q1[0];
      const s2_y = q2[1] - q1[1];
      const denom = -s2_x * s1_y + s1_x * s2_y;
      if (Math.abs(denom) < 1e-8) {
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
      console.log('[VolumeCroppingControlTool] No viewports available');
      return false;
    }
    let renderStatus = false;
    const { viewport, renderingEngine } = enabledElement;
    const { element } = viewport;
    let annotations = this._getAnnotations(enabledElement);
    console.log(
      '[VolumeCroppingControlTool] Annotations found:',
      annotations.length
    );
    // If we have virtual annotations , always include them
    if (this._virtualAnnotations && this._virtualAnnotations.length) {
      annotations = annotations.concat(this._virtualAnnotations);
      console.log(
        '[VolumeCroppingControlTool] Added virtual annotations, total:',
        annotations.length
      );
    }
    const camera = viewport.getCamera();
    const filteredToolAnnotations =
      this.filterInteractableAnnotationsForElement(element, annotations);
    console.log(
      '[VolumeCroppingControlTool] Filtered annotations:',
      filteredToolAnnotations.length
    );

    // viewport Annotation: use the first annotation for the current viewport
    const viewportAnnotation = filteredToolAnnotations[0];
    if (!viewportAnnotation || !viewportAnnotation.data) {
      console.log('[VolumeCroppingControlTool] No annotation for viewport');
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

    // Get clipping planes from annotation handles, fallback to this.clippingPlanes
    let clippingPlanes = viewportAnnotation.data.handles.clippingPlanes;
    console.log(
      '[VolumeCroppingControlTool] Clipping planes from annotation:',
      clippingPlanes?.length || 0
    );
    if (!clippingPlanes || clippingPlanes.length < 6) {
      // Try to use this.clippingPlanes if annotation doesn't have them yet
      if (this.clippingPlanes && this.clippingPlanes.length >= 6) {
        console.log(
          '[VolumeCroppingControlTool] Using this.clippingPlanes, count:',
          this.clippingPlanes.length
        );
        clippingPlanes = this.clippingPlanes;
        // Update annotation with the clipping planes
        data.handles.clippingPlanes = this.clippingPlanes.map((p) => ({
          origin: [...p.origin] as Types.Point3,
          normal: [...p.normal] as Types.Point3,
        }));
      } else {
        console.log(
          '[VolumeCroppingControlTool] No clipping planes available, returning false'
        );
        return false;
      }
    } else {
      console.log(
        '[VolumeCroppingControlTool] Using clipping planes from annotation, count:',
        clippingPlanes.length
      );
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

    // Draw all 6 clipping planes as reference lines
    // PLANEINDEX: XMIN=0, XMAX=1, YMIN=2, YMAX=3, ZMIN=4, ZMAX=5
    console.log(
      '[VolumeCroppingControlTool] Processing 6 clipping planes, viewPlaneNormal:',
      viewPlaneNormal,
      'focalPoint:',
      focalPoint
    );
    for (let planeIndex = 0; planeIndex < 6; planeIndex++) {
      const clippingPlane = clippingPlanes[planeIndex];
      console.log(
        `[VolumeCroppingControlTool] Processing plane ${planeIndex}:`,
        {
          origin: clippingPlane.origin,
          normal: clippingPlane.normal,
        }
      );

      // Compute intersection of clipping plane with viewport view plane
      const intersection = this._computePlanePlaneIntersection(
        clippingPlane,
        viewPlaneNormal,
        focalPoint
      );

      if (!intersection) {
        console.log(
          `[VolumeCroppingControlTool] Plane ${planeIndex}: Planes are parallel, skipping`
        );
        continue; // Planes are parallel, skip
      }
      console.log(
        `[VolumeCroppingControlTool] Plane ${planeIndex}: Intersection found:`,
        {
          point: intersection.point,
          direction: intersection.direction,
          pointValid:
            !isNaN(intersection.point[0]) &&
            !isNaN(intersection.point[1]) &&
            !isNaN(intersection.point[2]),
        }
      );

      // Find where the intersection line crosses viewport bounds
      const lineBounds = this._findLineBoundsIntersection(
        intersection.point,
        intersection.direction,
        viewport,
        viewPlaneNormal
      );

      if (!lineBounds) {
        console.log(
          `[VolumeCroppingControlTool] Plane ${planeIndex}: Line bounds not found, skipping. Intersection point was:`,
          intersection.point
        );
        continue;
      }
      console.log(
        `[VolumeCroppingControlTool] Plane ${planeIndex}: Line bounds:`,
        {
          start: lineBounds.start,
          end: lineBounds.end,
        }
      );

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
      console.log(
        `[VolumeCroppingControlTool] Plane ${planeIndex}: Added to referenceLines`
      );
    }

    console.log(
      '[VolumeCroppingControlTool] Total reference lines created:',
      referenceLines.length
    );
    console.log(
      '[VolumeCroppingControlTool] Reference lines summary:',
      referenceLines.map((line, idx) => {
        const planeIndex = line[4];
        const axis = planeIndex < 2 ? 'X' : planeIndex < 4 ? 'Y' : 'Z';
        const colorKey =
          planeIndex < 2 ? 'SAGITTAL' : planeIndex < 4 ? 'CORONAL' : 'AXIAL';
        return {
          index: idx,
          planeIndex: planeIndex,
          type: line[3],
          axis: axis,
          colorKey: colorKey,
          start: line[1],
          end: line[2],
        };
      })
    );

    data.referenceLines = referenceLines;

    // Draw the reference lines
    const viewportColor = this._getReferenceLineColor(viewport.id);
    const defaultColor =
      viewportColor !== undefined ? viewportColor : 'rgb(200, 200, 200)';
    console.log(
      '[VolumeCroppingControlTool] Drawing',
      referenceLines.length,
      'reference lines'
    );

    referenceLines.forEach((line, lineIndex) => {
      const [otherViewport, startPoint, endPoint, type, planeIndex] = line;

      // Ensure planeIndex is valid
      if (planeIndex === undefined || planeIndex < 0 || planeIndex >= 6) {
        return; // Skip invalid lines
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

      // Get color based on plane axis (X, Y, or Z)
      // PLANEINDEX: XMIN=0, XMAX=1, YMIN=2, YMAX=3, ZMIN=4, ZMAX=5
      // Note: Color configuration uses orientation names (SAGITTAL, CORONAL, AXIAL) as keys
      // for historical/API compatibility, but these refer to the volume's X, Y, Z axes, not viewport orientations
      let colorKey: 'SAGITTAL' | 'CORONAL' | 'AXIAL' | null = null;
      if (planeIndex === 0 || planeIndex === 1) {
        colorKey = 'SAGITTAL'; // X-axis planes (maps to SAGITTAL color config)
      } else if (planeIndex === 2 || planeIndex === 3) {
        colorKey = 'CORONAL'; // Y-axis planes (maps to CORONAL color config)
      } else if (planeIndex === 4 || planeIndex === 5) {
        colorKey = 'AXIAL'; // Z-axis planes (maps to AXIAL color config)
      }

      // Use lineColors from configuration (keys are orientation names for API compatibility)
      const lineColors = this.configuration.lineColors || {};
      const colorArr = colorKey
        ? lineColors[colorKey] || lineColors.UNKNOWN || [1.0, 0.0, 0.0]
        : [1.0, 0.0, 0.0]; // fallback to red
      // Convert [r,g,b] to rgb string if needed
      const color = Array.isArray(colorArr)
        ? `rgb(${colorArr.map((v) => Math.round(v * 255)).join(',')})`
        : colorArr;

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
      const axisName = planeIndex < 2 ? 'X' : planeIndex < 4 ? 'Y' : 'Z';
      console.log(
        `[VolumeCroppingControlTool] Drawing line ${lineIndex} (plane ${planeIndex}, ${type}, axis ${axisName}, colorKey ${colorKey}):`,
        {
          lineUID,
          intersections: intersections.length,
          color,
          lineWidth,
          startPoint,
          endPoint,
          lineLength: Math.sqrt(
            Math.pow(endPoint[0] - startPoint[0], 2) +
              Math.pow(endPoint[1] - startPoint[1], 2)
          ),
        }
      );
      // Always draw lines, not just if viewportControllable
      // (viewportControllable only affects whether they can be dragged)
      if (intersections.length === 2) {
        // Draw line between intersections
        console.log(
          `[VolumeCroppingControlTool] Drawing line between intersections:`,
          intersections[0].point,
          intersections[1].point
        );
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
        console.log(
          `[VolumeCroppingControlTool] Drawing full line:`,
          startPoint,
          endPoint
        );
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
    console.log(
      '[VolumeCroppingControlTool] renderAnnotation complete, renderStatus:',
      renderStatus
    );

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
      // If no originalClippingPlanes, wait for VolumeCroppingTool to send them
      // This branch should not be needed once VolumeCroppingTool always sends originalClippingPlanes
      if (evt.detail.seriesInstanceUID !== this.seriesInstanceUID) {
        return;
      }
      // For now, just return - we need clipping planes to update
      return;
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
          this.seriesInstanceUID = imageData.seriesInstanceUID;
          this._updateToolCentersFromViewport(viewport);
          // Clipping planes will be updated from VolumeCroppingTool via events
        }
      }
    }
    this._computeToolCenter(viewportsInfo);
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
      clippingPlanes.length >= 6
    ) {
      // If we have a specific plane index, update only that plane
      if (
        handles.activePlaneIndex !== undefined &&
        handles.activePlaneIndex >= 0 &&
        handles.activePlaneIndex < 6
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
        // Update XMIN, YMIN, ZMIN planes (fallback for backward compatibility)
        clippingPlanes[0].origin[0] += delta[0]; // XMIN
        clippingPlanes[2].origin[1] += delta[1]; // YMIN
        clippingPlanes[4].origin[2] += delta[2]; // ZMIN
      } else if (handles.activeType === 'max') {
        // Update XMAX, YMAX, ZMAX planes (fallback for backward compatibility)
        clippingPlanes[1].origin[0] += delta[0]; // XMAX
        clippingPlanes[3].origin[1] += delta[1]; // YMAX
        clippingPlanes[5].origin[2] += delta[2]; // ZMAX
      }

      // Update this.clippingPlanes to keep in sync
      this.clippingPlanes = clippingPlanes.map((p) => ({
        origin: [...p.origin] as Types.Point3,
        normal: [...p.normal] as Types.Point3,
      }));

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
              annotation.data.handles.clippingPlanes = this.clippingPlanes.map(
                (p) => ({
                  origin: [...p.origin] as Types.Point3,
                  normal: [...p.normal] as Types.Point3,
                })
              );
            }
          });
        }
      });

      // Update virtual annotations
      if (this._virtualAnnotations?.length > 0) {
        this._virtualAnnotations.forEach((annotation) => {
          if (annotation.data?.handles) {
            annotation.data.handles.clippingPlanes = this.clippingPlanes.map(
              (p) => ({
                origin: [...p.origin] as Types.Point3,
                normal: [...p.normal] as Types.Point3,
              })
            );
          }
        });
      }

      triggerAnnotationRenderForViewportIds(
        viewportsInfo.map(({ viewportId }) => viewportId)
      );

      // Send event with clipping planes instead of toolCenter
      triggerEvent(eventTarget, Events.VOLUMECROPPINGCONTROL_TOOL_CHANGED, {
        toolGroupId: this.toolGroupId,
        clippingPlanes: this.clippingPlanes,
        handleType: handles.activeType,
        seriesInstanceUID: this.seriesInstanceUID,
      });
    }
  };

  _applyDeltaShiftToSelectedViewportCameras(
    renderingEngine,
    viewportsAnnotationsToUpdate,
    delta
  ) {
    // update camera for the other viewports.
    // NOTE1: The lines then are rendered by the onCameraModified
    viewportsAnnotationsToUpdate.forEach((annotation) => {
      this._applyDeltaShiftToViewportCamera(renderingEngine, annotation, delta);
    });
  }

  _applyDeltaShiftToViewportCamera(
    renderingEngine: Types.IRenderingEngine,
    annotation,
    delta
  ) {
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

    const referenceLines = data.referenceLines;

    const viewportIdArray = [];

    if (referenceLines) {
      for (let i = 0; i < referenceLines.length; ++i) {
        // Each line: [viewport, startPoint, endPoint, type, planeIndex]
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
