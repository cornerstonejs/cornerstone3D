import { vec3 } from 'gl-matrix';
import {
  getEnabledElement,
  getEnabledElementByIds,
  getEnabledElementByViewportId,
  eventTarget,
  triggerEvent,
  utilities as csUtils,
  Enums,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from './base';
import { getToolGroup } from '../store/ToolGroupManager';
import { state } from '../store/state';
import { Events } from '../enums';
import {
  addAnnotation,
  removeAnnotation,
} from '../stateManagement/annotation/annotationState';
import {
  drawCircle as drawCircleSvg,
  drawLine as drawLineSvg,
  drawTextBox as drawTextBoxSvg,
} from '../drawingSvg';
import {
  resetElementCursor,
  hideElementCursor,
} from '../cursors/elementCursor';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import getViewportICamera from '../utilities/getViewportICamera';
import { navigatePlanarViewportToPoint } from '../utilities/genericViewportToolHelpers';
import {
  getViewportPlane,
  distancePointToPlane,
  projectPointToPlane,
  getDisplayedCanvasSize,
} from '../utilities/spatial';
import pickIntensityPointInSlab from '../utilities/pickIntensityPointInSlab';
import {
  updateWorldCrosshairLines3D,
  removeWorldCrosshairLines3D,
} from './worldCrosshair/WorldCrosshairLines3D';
import type {
  Annotation,
  Annotations,
  EventTypes,
  InteractionTypes,
  PublicToolProps,
  SVGDrawingHelper,
  ToolHandle,
  ToolProps,
} from '../types';

const { ViewportType } = Enums;

/**
 * Two world points closer than this (in world units / mm) are considered the
 * same point: no WORLD_CROSSHAIR_POINT_CHANGED event is emitted for changes
 * below this threshold.
 */
const POINT_EPSILON = 1e-4;

/** Slice moves shorter than this (mm) are skipped when jumping. */
const JUMP_EPSILON = 1e-6;

export type WorldCrosshairJumpMode = 'sliceOnly' | 'centered';

export type WorldCrosshairOffSliceDisplay =
  | 'hide'
  | 'projected'
  | 'projectedWithDistance';

/**
 * The authoritative state of the WorldCrosshairTool. There is exactly one
 * such state per tool group (per tool instance); the source of truth is
 * `worldPoint`, which is fully independent from any viewport camera.
 */
export type WorldCrosshairState = {
  toolGroupId: string;
  worldPoint: Types.Point3 | null;
  sourceViewportId?: string;
  sourceRenderingEngineId?: string;
  frameOfReferenceUID?: string;
  visible: boolean;
  locked: boolean;
  cursorWorldPoint?: Types.Point3 | null;
};

export type WorldCrosshairMarkerStyle = 'crosshair' | 'point';

export type WorldCrosshairToolConfiguration = {
  pointColor: string;
  /**
   * Grab radius (px) around the crosshair center for hit-testing; also the
   * dot radius when markerStyle is 'point'.
   */
  pointRadius: number;
  /**
   * 'crosshair' (default) renders the reference point as a full vertical and
   * horizontal line intersecting at the point; 'point' renders a filled dot.
   */
  markerStyle: WorldCrosshairMarkerStyle;
  /**
   * Gap (px) left around the crossing point of the crosshair lines, so the
   * marker reads as a reference point and never blends into slice
   * intersection lines.
   */
  centerGapRadius: number;

  /**
   * How the marker renders when the point is off the displayed slice:
   * 'projectedWithDistance' (dashed + signed mm label), 'projected' (dashed,
   * no distance information) or 'hide'. Use 'projected' to hide the
   * above/below distance label.
   */
  offSliceDisplay: WorldCrosshairOffSliceDisplay;
  /**
   * Minimum distance (mm) at which the point counts as off-slice. The
   * effective tolerance per viewport is at least half that viewport's slice
   * spacing along its normal: a viewport snapped to its closest slice is
   * showing the point as well as it can, and renders the marker solid (a
   * fixed sub-spacing tolerance would flicker dashed/solid on coarse
   * modalities like PET).
   */
  offSliceToleranceMm: number;

  /**
   * When true (default), the tool picks an initial point on enable (the
   * current slice center of the first linked planar viewport) so the
   * crosshair renders without requiring a first click. Clearing the point
   * keeps it cleared until the tool is re-enabled.
   */
  autoInitializeOnEnable: boolean;
  /**
   * Whether a plain click (without shift) sets/moves the point. Defaults to
   * false: the point moves only through shift interactions (or the
   * programmatic API).
   */
  clickToSet: boolean;
  /**
   * When true (default) and the point is set from a viewport rendering an
   * intensity-projection slab (MIP/MinIP), the point snaps to the
   * extremal-intensity location along the view normal within the slab - the
   * anatomy the projection actually shows (e.g. the hottest PET voxel)
   * instead of the arbitrary central slab plane. Plain slice viewports are
   * unaffected.
   */
  snapToSlabIntensity: boolean;

  jumpOnSet: boolean;
  jumpMode: WorldCrosshairJumpMode;
  preservePanZoom: boolean;

  liveUpdateOnShiftMouseMove: boolean;
  liveJumpOnShiftMouseMove: boolean;

  showIn2D: boolean;

  /** Whether to render the point in the configured 3D viewports. */
  showIn3D: boolean;
  /**
   * Ids of Generic 3D (VOLUME_3D_NEXT) viewports in which the point is
   * rendered as two world-space intersecting lines. Kept as an explicit list
   * so 3D viewports (usually in their own tool group for trackball
   * manipulation) need not join this tool's group.
   */
  threeDViewportIds: string[];
  /** Full length (mm) of each 3D crosshair line. */
  threeDLineLengthMm: number;

  linkPolicy: 'toolGroup' | 'frameOfReferenceUID' | 'explicit';
  /** Viewport ids considered linked when linkPolicy is 'explicit'. */
  explicitLinkedViewportIds: string[];
};

export type WorldCrosshairPointChangedEventDetail = {
  toolGroupId: string;
  worldPoint: Types.Point3 | null;
  sourceViewportId?: string;
  sourceRenderingEngineId?: string;
  frameOfReferenceUID?: string;
};

export type WorldCrosshairAnnotation = Annotation & {
  data: {
    handles: {
      points: Types.Point3[];
    };
  };
};

function isFinitePoint3(point): point is Types.Point3 {
  return (
    Array.isArray(point) &&
    point.length === 3 &&
    point.every((v) => Number.isFinite(v))
  );
}

/**
 * Parses a CSS color ('rgb(r, g, b)', 'rgba(...)' or '#rrggbb') into
 * normalized [0, 1] RGB for vtk actors. Falls back to yellow.
 */
function parseCssColorToRGB(color: string): [number, number, number] {
  if (typeof color === 'string') {
    const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
      return [
        Number(rgbMatch[1]) / 255,
        Number(rgbMatch[2]) / 255,
        Number(rgbMatch[3]) / 255,
      ];
    }

    const hexMatch = color.match(/^#([0-9a-f]{6})$/i);
    if (hexMatch) {
      const hex = parseInt(hexMatch[1], 16);
      return [
        ((hex >> 16) & 255) / 255,
        ((hex >> 8) & 255) / 255,
        (hex & 255) / 255,
      ];
    }
  }

  return [1, 1, 0];
}

/**
 * WorldCrosshairTool ("Reference Point") stores and renders one persistent
 * world-space point of interest per tool group.
 *
 * The user selected this anatomical/world point; the tool keeps that point
 * stable while viewports scroll, pan, zoom or rotate, unless the user
 * explicitly moves the point. The point is never derived from viewport
 * cameras, camera focal points or slice plane intersections, and the tool
 * deliberately does not react to CAMERA_MODIFIED or view-state resets.
 *
 * The tool targets the Generic ("next") viewport architecture exclusively: it
 * only operates on direct PLANAR_NEXT viewports through the native view-state
 * API (getResolvedView / setViewReference / setViewState). Legacy stack and
 * volume viewports (and their compatibility adapters) are ignored.
 *
 * The tool works with a single viewport and renders the point (or its
 * off-slice projection) in linked planar viewports. It does not render slice
 * intersection lines, does not rotate or translate slice planes and does not
 * touch slab thickness: those belong to the SliceIntersectionTool.
 */
class WorldCrosshairTool extends AnnotationTool {
  static toolName;
  /** User-facing label for this tool. */
  static toolLabel = 'Reference Point';

  private _state: Omit<WorldCrosshairState, 'toolGroupId'> = {
    worldPoint: null,
    visible: true,
    locked: false,
    cursorWorldPoint: null,
  };

  private _annotation: WorldCrosshairAnnotation | null = null;
  private _isDragging = false;
  /**
   * True once a point exists (set interactively, programmatically or by
   * auto-initialization) in the current enable cycle; keeps a cleared point
   * cleared instead of re-auto-initializing on the next render.
   */
  private _autoInitialized = false;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        pointColor: 'rgb(255, 255, 0)',
        pointRadius: 4,
        markerStyle: 'crosshair',
        // Optional gap around the crossing point (0 disables it).
        centerGapRadius: 12,

        offSliceDisplay: 'projectedWithDistance',
        offSliceToleranceMm: 0.5,

        autoInitializeOnEnable: true,
        clickToSet: false,
        snapToSlabIntensity: true,

        jumpOnSet: true,
        jumpMode: 'sliceOnly',
        preservePanZoom: true,

        liveUpdateOnShiftMouseMove: true,
        liveJumpOnShiftMouseMove: true,

        showIn2D: true,

        showIn3D: true,
        threeDViewportIds: [],
        threeDLineLengthMm: 100,

        linkPolicy: 'frameOfReferenceUID',
        explicitLinkedViewportIds: [],
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  // ===================================================================
  // Public API
  // ===================================================================

  /**
   * Sets the persistent world point. This is the only way the point changes:
   * it is never recomputed from cameras or plane intersections.
   *
   * Emits WORLD_CROSSHAIR_POINT_CHANGED only when the point actually changes
   * (beyond a small epsilon). Jumps linked slice viewports to the point when
   * `options.jump` (or the `jumpOnSet` configuration) is true.
   */
  public setWorldPoint(
    worldPoint: Types.Point3,
    options: {
      sourceViewportId?: string;
      sourceRenderingEngineId?: string;
      frameOfReferenceUID?: string;
      jump?: boolean;
      suppressEvents?: boolean;
    } = {}
  ): void {
    if (!isFinitePoint3(worldPoint)) {
      return;
    }

    const newPoint: Types.Point3 = [
      worldPoint[0],
      worldPoint[1],
      worldPoint[2],
    ];
    const previousPoint = this._state.worldPoint;
    const changed =
      !previousPoint || vec3.distance(previousPoint, newPoint) > POINT_EPSILON;

    if (options.sourceViewportId !== undefined) {
      this._state.sourceViewportId = options.sourceViewportId;
    }
    if (options.sourceRenderingEngineId !== undefined) {
      this._state.sourceRenderingEngineId = options.sourceRenderingEngineId;
    }
    if (options.frameOfReferenceUID !== undefined) {
      this._state.frameOfReferenceUID = options.frameOfReferenceUID;
    }

    if (changed) {
      this._state.worldPoint = newPoint;
      this._autoInitialized = true;
      this._syncAnnotation();

      if (!options.suppressEvents) {
        triggerEvent(
          eventTarget,
          Events.WORLD_CROSSHAIR_POINT_CHANGED,
          this._getEventDetail()
        );
      }
    }

    const shouldJump = options.jump ?? this.configuration.jumpOnSet;
    if (shouldJump) {
      this._jumpLinkedViewports({ suppressEvents: true });
    }

    if (changed) {
      this._update3DLines();
    }
    this._renderLinkedViewports();
  }

  /**
   * Returns a copy of the stored world point, or null when no point is set.
   */
  public getWorldPoint(): Types.Point3 | null {
    const { worldPoint } = this._state;
    return worldPoint ? [worldPoint[0], worldPoint[1], worldPoint[2]] : null;
  }

  /**
   * Clears the world point, removes the marker from all linked views and
   * emits WORLD_CROSSHAIR_POINT_CLEARED (unless suppressed).
   */
  public clearWorldPoint(options: { suppressEvents?: boolean } = {}): void {
    if (!this._state.worldPoint) {
      return;
    }

    this._state.worldPoint = null;
    this._state.cursorWorldPoint = null;
    this._syncAnnotation();
    this._update3DLines();

    if (!options.suppressEvents) {
      triggerEvent(
        eventTarget,
        Events.WORLD_CROSSHAIR_POINT_CLEARED,
        this._getEventDetail()
      );
    }

    this._renderLinkedViewports();
  }

  /**
   * Clear command alias for {@link clearWorldPoint}.
   */
  public clearWorldCrosshair(options: { suppressEvents?: boolean } = {}): void {
    this.clearWorldPoint(options);
  }

  /**
   * Jumps all linked planar viewports to the stored world point by navigating
   * each viewport's view reference (never rotating, never touching slab
   * thickness or zoom). Emits WORLD_CROSSHAIR_JUMPED_TO_POINT.
   */
  public jumpLinkedViewportsToWorldPoint(
    options: {
      jumpMode?: WorldCrosshairJumpMode;
      preservePanZoom?: boolean;
    } = {}
  ): void {
    this._jumpLinkedViewports({ ...options, suppressEvents: false });
  }

  /**
   * Shows or hides the marker in all linked views without clearing the point.
   */
  public setVisibility(visible: boolean): void {
    if (this._state.visible === visible) {
      return;
    }
    this._state.visible = visible;
    this._update3DLines();
    this._renderLinkedViewports();
  }

  /**
   * Locks or unlocks the point against interactive changes (click, drag,
   * shift+move). The programmatic API is not affected by the lock.
   */
  public setLocked(locked: boolean): void {
    this._state.locked = locked;
  }

  /**
   * Returns a copy of the tool state.
   */
  public getState(): WorldCrosshairState {
    return {
      toolGroupId: this.toolGroupId,
      ...this._state,
      worldPoint: this.getWorldPoint(),
      cursorWorldPoint: this._state.cursorWorldPoint
        ? ([...this._state.cursorWorldPoint] as Types.Point3)
        : null,
    };
  }

  // ===================================================================
  // Tool lifecycle
  // ===================================================================

  onSetToolEnabled(): void {
    this._syncAnnotation();
    this._maybeAutoInitialize();
    this._update3DLines();
    this._renderLinkedViewports();
  }

  onSetToolActive(): void {
    this.onSetToolEnabled();
  }

  onSetToolPassive(): void {
    this.onSetToolEnabled();
  }

  onSetToolDisabled(): void {
    this._isDragging = false;
    this._autoInitialized = false;
    state.isInteractingWithTool = false;

    if (this._annotation?.annotationUID) {
      removeAnnotation(this._annotation.annotationUID);
    }
    this._annotation = null;

    this._get3DViewports().forEach((viewport) =>
      removeWorldCrosshairLines3D(viewport, this._getMarkerUIDPrefix())
    );
    this._renderLinkedViewports();
  }

  // ===================================================================
  // Interactions
  // ===================================================================

  /**
   * Called on mouse down / touch start in empty space: sets the world point
   * from the event world coordinates and starts a drag so the point can be
   * refined while the button is held. By default this requires shift to be
   * held (clickToSet enables plain clicks), and only planar generic
   * viewports participate.
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): WorldCrosshairAnnotation => {
    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;
    const enabledElement = getEnabledElement(element);

    if (!enabledElement || this._state.locked) {
      return this._getAnnotationOrDetached();
    }

    const nativeEvent = eventDetail.event as MouseEvent | undefined;
    if (!this.configuration.clickToSet && !nativeEvent?.shiftKey) {
      // The point only moves through shift interactions; leave the click to
      // other tools.
      return this._getAnnotationOrDetached();
    }

    const { viewport, renderingEngine, FrameOfReferenceUID } = enabledElement;

    if (!this._isPlanarViewport(viewport)) {
      return this._getAnnotationOrDetached();
    }

    this.setWorldPoint(
      this._resolveInteractionWorldPoint(viewport, currentPoints.world),
      {
        sourceViewportId: viewport.id,
        sourceRenderingEngineId: renderingEngine?.id,
        frameOfReferenceUID: FrameOfReferenceUID,
      }
    );

    evt.preventDefault();
    hideElementCursor(element);
    this._activateModify(element);

    return this._getAnnotationOrDetached();
  };

  /**
   * Starts dragging the marker within the active planar viewport. The drag
   * only moves the world point: it never rotates viewports, never translates
   * slice planes through line dragging and never changes slab thickness.
   */
  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: Annotation
  ): void => {
    const { element } = evt.detail;

    if (this._state.locked) {
      return;
    }

    annotation.highlighted = true;
    hideElementCursor(element);
    this._activateModify(element);
    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    annotation: Annotation,
    _handle: ToolHandle,
    _interactionType: InteractionTypes = 'Mouse'
  ): void => {
    this.toolSelectedCallback(evt, annotation);
  };

  /**
   * Double click on the marker jumps linked slice viewports back to the
   * stored world point.
   */
  doubleClickCallback = (evt: EventTypes.MouseDoubleClickEventType): void => {
    const { element, currentPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);

    if (!enabledElement || !this._state.worldPoint) {
      return;
    }

    const markerCanvas = this._getMarkerCanvasPosition(enabledElement.viewport);
    if (!markerCanvas) {
      return;
    }

    const distance = Math.hypot(
      markerCanvas[0] - currentPoints.canvas[0],
      markerCanvas[1] - currentPoints.canvas[1]
    );

    if (distance > this.configuration.pointRadius + 6) {
      return;
    }

    this.jumpLinkedViewportsToWorldPoint();
    evt.preventDefault();
  };

  /**
   * Hover highlighting, plus continuous live update of the point while shift
   * is held (when configured).
   */
  mouseMoveCallback = (
    evt: EventTypes.MouseMoveEventType,
    filteredToolAnnotations?: Annotations
  ): boolean => {
    const { element, currentPoints } = evt.detail;
    const nativeEvent = evt.detail.event as MouseEvent | undefined;
    let needsRedraw = false;

    if (
      this.configuration.liveUpdateOnShiftMouseMove &&
      nativeEvent?.shiftKey &&
      !this._state.locked
    ) {
      const enabledElement = getEnabledElement(element);
      const viewport = enabledElement?.viewport;

      if (viewport && this._isPlanarViewport(viewport)) {
        this._state.cursorWorldPoint = [
          currentPoints.world[0],
          currentPoints.world[1],
          currentPoints.world[2],
        ];
        this.setWorldPoint(
          this._resolveInteractionWorldPoint(viewport, currentPoints.world),
          {
            sourceViewportId: viewport.id,
            sourceRenderingEngineId: enabledElement.renderingEngine?.id,
            frameOfReferenceUID: enabledElement.FrameOfReferenceUID,
            jump: this.configuration.liveJumpOnShiftMouseMove,
          }
        );
        needsRedraw = true;
      }
    }

    if (filteredToolAnnotations?.length) {
      for (const annotation of filteredToolAnnotations) {
        const near = this.isPointNearTool(
          element,
          annotation as WorldCrosshairAnnotation,
          currentPoints.canvas,
          6,
          'mouse'
        );

        if (near !== !!annotation.highlighted) {
          annotation.highlighted = near;
          needsRedraw = true;
        }
      }
    }

    return needsRedraw;
  };

  isPointNearTool = (
    element: HTMLDivElement,
    _annotation: WorldCrosshairAnnotation,
    canvasCoords: Types.Point2,
    proximity: number,
    _interactionType?: string
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return false;
    }

    const markerCanvas = this._getMarkerCanvasPosition(enabledElement.viewport);
    if (!markerCanvas) {
      return false;
    }

    const distance = Math.hypot(
      markerCanvas[0] - canvasCoords[0],
      markerCanvas[1] - canvasCoords[1]
    );

    return distance <= this.configuration.pointRadius + proximity;
  };

  getHandleNearImagePoint(
    element: HTMLDivElement,
    annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
    if (
      this.isPointNearTool(
        element,
        annotation as WorldCrosshairAnnotation,
        canvasCoords,
        proximity,
        'mouse'
      )
    ) {
      return this._state.worldPoint as ToolHandle;
    }
  }

  filterInteractableAnnotationsForElement = (
    element: HTMLDivElement,
    annotations: Annotations
  ): Annotations => {
    if (!annotations?.length || !this._state.worldPoint) {
      return [];
    }

    const enabledElement = getEnabledElement(element);
    if (
      !enabledElement ||
      !this._getMarkerCanvasPosition(enabledElement.viewport)
    ) {
      return [];
    }

    return annotations.filter(
      (annotation) => annotation.metadata.toolName === this.getToolName()
    );
  };

  cancel = (element: HTMLDivElement): void => {
    if (this._isDragging) {
      this._deactivateModify(element);
      resetElementCursor(element);
    }
  };

  _activateModify = (element: HTMLDivElement): void => {
    this._isDragging = true;
    state.isInteractingWithTool = true;

    const endCallback = this._endCallback as EventListener;
    const dragCallback = this._dragCallback as EventListener;

    element.addEventListener(Events.MOUSE_UP, endCallback);
    element.addEventListener(Events.MOUSE_DRAG, dragCallback);
    element.addEventListener(Events.MOUSE_CLICK, endCallback);

    element.addEventListener(Events.TOUCH_END, endCallback);
    element.addEventListener(Events.TOUCH_DRAG, dragCallback);
    element.addEventListener(Events.TOUCH_TAP, endCallback);
  };

  _deactivateModify = (element: HTMLDivElement): void => {
    this._isDragging = false;
    state.isInteractingWithTool = false;

    const endCallback = this._endCallback as EventListener;
    const dragCallback = this._dragCallback as EventListener;

    element.removeEventListener(Events.MOUSE_UP, endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, dragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, endCallback);

    element.removeEventListener(Events.TOUCH_END, endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, dragCallback);
    element.removeEventListener(Events.TOUCH_TAP, endCallback);
  };

  _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    const eventDetail = evt.detail;
    const { element, currentPoints } = eventDetail;
    const enabledElement = getEnabledElement(element);

    if (!enabledElement || this._state.locked) {
      return;
    }

    const { viewport, renderingEngine, FrameOfReferenceUID } = enabledElement;

    if (!this._isPlanarViewport(viewport)) {
      return;
    }

    this._state.cursorWorldPoint = [
      currentPoints.world[0],
      currentPoints.world[1],
      currentPoints.world[2],
    ];

    this.setWorldPoint(
      this._resolveInteractionWorldPoint(viewport, currentPoints.world),
      {
        sourceViewportId: viewport.id,
        sourceRenderingEngineId: renderingEngine?.id,
        frameOfReferenceUID: FrameOfReferenceUID,
      }
    );
  };

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const { element } = evt.detail;

    this._deactivateModify(element);
    resetElementCursor(element);
    this._state.cursorWorldPoint = null;
    this._renderLinkedViewports();
  };

  // ===================================================================
  // Rendering
  // ===================================================================

  /**
   * Renders the marker for one linked planar viewport. By default the
   * reference point is drawn as a full vertical and horizontal line
   * intersecting at the projection of the world point onto the viewport
   * plane ('crosshair' marker style); the 'point' style draws a filled dot
   * instead. A point that is not on the currently displayed slice is drawn
   * dashed/faded (and optionally labeled with its signed distance) so it
   * never looks like it lies on the slice.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    // Data may not have been mounted yet when the tool was enabled; retry
    // the auto-initialization lazily from the rendering viewport.
    this._maybeAutoInitialize(enabledElement);

    const { viewport } = enabledElement;
    const { worldPoint, visible } = this._state;
    const {
      showIn2D,
      pointColor,
      pointRadius,
      markerStyle,
      offSliceDisplay,
      offSliceToleranceMm,
    } = this.configuration;

    if (!worldPoint || !visible || !showIn2D) {
      return false;
    }

    if (!this._isPlanarViewport(viewport)) {
      return false;
    }

    if (!this._isViewportLinked(viewport)) {
      return false;
    }

    const plane = getViewportPlane(viewport);
    if (!plane) {
      return false;
    }

    const distanceMm = distancePointToPlane(worldPoint, plane);
    const projectedPoint = projectPointToPlane(worldPoint, plane);
    const canvasPoint = viewport.worldToCanvas(projectedPoint);

    if (!canvasPoint || !canvasPoint.every((c) => Number.isFinite(c))) {
      return false;
    }

    const toleranceMm = this._getEffectiveOffSliceTolerance(
      viewport,
      plane,
      offSliceToleranceMm
    );
    const inSlice = Math.abs(distanceMm) <= toleranceMm;

    if (!inSlice && offSliceDisplay === 'hide') {
      return false;
    }

    const annotationUID =
      this._annotation?.annotationUID ?? `WorldCrosshair-${this.toolGroupId}`;
    const highlighted = !!this._annotation?.highlighted;

    // Off-slice markers are dashed and faded so they cannot be mistaken for
    // a point lying on this slice.
    const lineOptions = {
      color: pointColor,
      width: highlighted ? 2 : 1,
      ...(inSlice ? {} : { lineDash: '3,3', strokeOpacity: 0.7 }),
    };

    if (markerStyle === 'point') {
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        'marker',
        canvasPoint,
        pointRadius,
        {
          ...lineOptions,
          fill: inSlice ? pointColor : 'transparent',
        },
        `${annotationUID}-marker`
      );
    } else {
      // 'crosshair': a full vertical and horizontal line intersecting at the
      // point, with a small gap around the crossing so the marker never
      // blends into slice intersection lines.
      const { clientWidth, clientHeight } = getDisplayedCanvasSize(viewport);
      const gap = Math.max(this.configuration.centerGapRadius ?? 0, 0);
      const [x, y] = canvasPoint;

      const segments: Array<[string, Types.Point2, Types.Point2]> = [
        ['marker-h1', [0, y], [x - gap, y]],
        ['marker-h2', [x + gap, y], [clientWidth, y]],
        ['marker-v1', [x, 0], [x, y - gap]],
        ['marker-v2', [x, y + gap], [x, clientHeight]],
      ];

      segments.forEach(([uid, startPoint, endPoint]) => {
        const length = Math.hypot(
          endPoint[0] - startPoint[0],
          endPoint[1] - startPoint[1]
        );
        const towardsPositive =
          endPoint[0] >= startPoint[0] && endPoint[1] >= startPoint[1];
        if (length < 1 || !towardsPositive) {
          return;
        }

        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          uid,
          startPoint,
          endPoint,
          lineOptions,
          `${annotationUID}-${uid}`
        );
      });
    }

    if (!inSlice && offSliceDisplay === 'projectedWithDistance') {
      const sign = distanceMm >= 0 ? '+' : '-';
      const label = `${sign}${Math.abs(distanceMm).toFixed(1)} mm`;

      drawTextBoxSvg(
        svgDrawingHelper,
        annotationUID,
        'marker-distance',
        [label],
        [canvasPoint[0] + pointRadius + 6, canvasPoint[1] + pointRadius + 6],
        {
          color: pointColor,
        }
      );
    }

    return true;
  };

  /**
   * Picks an initial point (the current slice center of a linked planar
   * viewport) so the crosshair renders without requiring a first click.
   * Runs at most once per enable cycle; a subsequent clearWorldPoint keeps
   * the point cleared.
   */
  private _maybeAutoInitialize(enabledElement?: Types.IEnabledElement): void {
    if (
      this._autoInitialized ||
      this._state.worldPoint ||
      !this.configuration.autoInitializeOnEnable
    ) {
      return;
    }

    let viewport = enabledElement?.viewport;
    let renderingEngineId = enabledElement?.renderingEngine?.id;
    let frameOfReferenceUID = enabledElement?.FrameOfReferenceUID;

    if (!viewport) {
      for (const info of this._getViewportsInfo()) {
        const candidate = getEnabledElementByIds(
          info.viewportId,
          info.renderingEngineId
        );
        if (candidate && this._isPlanarViewport(candidate.viewport)) {
          viewport = candidate.viewport;
          renderingEngineId = candidate.renderingEngine?.id;
          frameOfReferenceUID = candidate.FrameOfReferenceUID;
          break;
        }
      }
    }

    if (!viewport || !this._isPlanarViewport(viewport)) {
      return;
    }

    const { focalPoint } = getViewportICamera(viewport);
    if (!isFinitePoint3(focalPoint)) {
      return;
    }

    // setWorldPoint marks _autoInitialized.
    this.setWorldPoint(focalPoint, {
      sourceViewportId: viewport.id,
      sourceRenderingEngineId: renderingEngineId,
      frameOfReferenceUID:
        frameOfReferenceUID ?? viewport.getFrameOfReferenceUID?.(),
      jump: false,
    });
  }

  // ===================================================================
  // Jumping (native next navigation only)
  // ===================================================================

  private _jumpLinkedViewports(
    options: {
      jumpMode?: WorldCrosshairJumpMode;
      preservePanZoom?: boolean;
      suppressEvents?: boolean;
    } = {}
  ): void {
    const { worldPoint } = this._state;
    if (!worldPoint) {
      return;
    }

    const jumpMode = options.jumpMode ?? this.configuration.jumpMode;

    // Guard the fan-out so other tools reacting to CAMERA_MODIFIED (e.g. the
    // SliceIntersectionTool active-source tracking) can tell these camera
    // writes apart from direct user navigation.
    const previousInteracting = state.isInteractingWithTool;
    state.isInteractingWithTool = true;
    try {
      this._getLinkedViewports().forEach((viewport) => {
        this._jumpViewportToPoint(viewport, worldPoint, jumpMode);
      });
    } finally {
      state.isInteractingWithTool = previousInteracting;
    }

    if (!options.suppressEvents) {
      triggerEvent(
        eventTarget,
        Events.WORLD_CROSSHAIR_JUMPED_TO_POINT,
        this._getEventDetail()
      );
    }
  }

  /**
   * Moves one planar viewport to the world point through the native view
   * reference / view state API:
   * - 'sliceOnly' navigates to the slice nearest the point along the current
   *   view-plane normal; pan and zoom are untouched.
   * - 'centered' additionally anchors the point to the canvas center; zoom is
   *   still preserved.
   *
   * Volume-backed slices navigate exactly through the point; image stacks
   * navigate to the closest image (by per-image plane metadata). The
   * viewport is never rotated and slab thickness is never touched.
   */
  private _jumpViewportToPoint(
    viewport: Types.IViewport,
    worldPoint: Types.Point3,
    jumpMode: WorldCrosshairJumpMode
  ): void {
    if (!this._isPlanarViewport(viewport)) {
      return;
    }

    const { focalPoint, viewPlaneNormal } = getViewportICamera(viewport);
    if (!focalPoint || !viewPlaneNormal) {
      return;
    }

    const delta = vec3.subtract(vec3.create(), worldPoint, focalPoint);
    const normalDistance = vec3.dot(delta, viewPlaneNormal);

    if (jumpMode === 'centered') {
      // Match the slice-only branch below: only pin/render when navigation
      // succeeds, otherwise the viewport would be anchored to a point it
      // never actually navigated to (e.g. a stack viewport with no valid
      // closest image).
      if (!navigatePlanarViewportToPoint(viewport, worldPoint)) {
        return;
      }
      // Pin the point to the canvas center fraction; zoom is untouched.
      viewport.setViewState({
        anchorWorld: [worldPoint[0], worldPoint[1], worldPoint[2]],
        anchorCanvas: [0.5, 0.5],
      });
      viewport.render();
      return;
    }

    if (Math.abs(normalDistance) < JUMP_EPSILON) {
      return;
    }

    // Slice-only: navigate along the current normal so the in-plane (pan)
    // position is preserved.
    const targetFocalPoint = vec3.scaleAndAdd(
      vec3.create(),
      focalPoint,
      viewPlaneNormal,
      normalDistance
    );

    if (
      navigatePlanarViewportToPoint(viewport, [
        targetFocalPoint[0],
        targetFocalPoint[1],
        targetFocalPoint[2],
      ])
    ) {
      viewport.render();
    }
  }

  // ===================================================================
  // 3D support (world-space crosshair lines)
  // ===================================================================

  /**
   * Resolves the configured Generic 3D viewports the point is mirrored into.
   */
  private _get3DViewports(): Types.IViewport[] {
    const { threeDViewportIds } = this.configuration;
    if (!threeDViewportIds?.length) {
      return [];
    }

    return threeDViewportIds
      .map(
        (viewportId) =>
          getEnabledElementByViewportId(viewportId)?.viewport as
            | Types.IViewport
            | undefined
      )
      .filter(
        (viewport) =>
          viewport &&
          viewport.type === ViewportType.VOLUME_3D_NEXT &&
          csUtils.isGenericViewport(viewport)
      );
  }

  /**
   * Creates, moves or removes the two intersecting world-space lines that
   * represent the point in the configured 3D viewports.
   */
  private _update3DLines(): void {
    const { showIn3D, threeDLineLengthMm, pointColor } = this.configuration;
    const { worldPoint, visible } = this._state;
    const uidPrefix = this._getMarkerUIDPrefix();

    this._get3DViewports().forEach((viewport) => {
      if (showIn3D && visible && worldPoint) {
        updateWorldCrosshairLines3D(viewport, worldPoint, {
          lineLengthMm: threeDLineLengthMm,
          color: parseCssColorToRGB(pointColor),
          uidPrefix,
        });
      } else {
        removeWorldCrosshairLines3D(viewport, uidPrefix);
      }
    });
  }

  private _getMarkerUIDPrefix(): string {
    return `WorldCrosshair-${this.toolGroupId}`;
  }

  // ===================================================================
  // Linking / state helpers
  // ===================================================================

  /**
   * Narrows to the direct Generic planar ("next") viewport surface. Legacy
   * viewports and legacy compatibility adapters never match: the tool is
   * native-next only.
   */
  private _isPlanarViewport(
    viewport: Types.IViewport
  ): viewport is Types.IGenericViewport {
    return (
      viewport?.type === ViewportType.PLANAR_NEXT &&
      csUtils.isGenericViewport(viewport)
    );
  }

  protected _getViewportsInfo(): Types.IViewportId[] {
    return getToolGroup(this.toolGroupId)?.viewportsInfo ?? [];
  }

  /**
   * Resolves the planar viewports linked to the world point according to the
   * configured link policy. The source viewport (where the point was set) is
   * always considered linked.
   */
  protected _getLinkedViewports(): Types.IViewport[] {
    const viewports = this._getViewportsInfo()
      .map(
        ({ viewportId, renderingEngineId }) =>
          getEnabledElementByIds(viewportId, renderingEngineId)?.viewport
      )
      .filter((viewport) => viewport && this._isPlanarViewport(viewport));

    const { linkPolicy, explicitLinkedViewportIds } = this.configuration;
    const { sourceViewportId, frameOfReferenceUID } = this._state;

    if (linkPolicy === 'explicit') {
      return viewports.filter(
        (viewport) =>
          viewport.id === sourceViewportId ||
          explicitLinkedViewportIds?.includes(viewport.id)
      );
    }

    if (linkPolicy === 'frameOfReferenceUID') {
      if (!frameOfReferenceUID) {
        return viewports;
      }
      return viewports.filter(
        (viewport) =>
          viewport.id === sourceViewportId ||
          viewport.getFrameOfReferenceUID?.() === frameOfReferenceUID
      );
    }

    // 'toolGroup'
    return viewports;
  }

  /**
   * O(1) link check for a single viewport (called per viewport on every
   * annotation render, so it must not rebuild the whole linked list).
   */
  private _isViewportLinked(viewport: Types.IViewport): boolean {
    if (!this._isPlanarViewport(viewport)) {
      return false;
    }

    if (
      !this._getViewportsInfo().some(
        ({ viewportId }) => viewportId === viewport.id
      )
    ) {
      return false;
    }

    const { linkPolicy, explicitLinkedViewportIds } = this.configuration;
    const { sourceViewportId, frameOfReferenceUID } = this._state;

    if (viewport.id === sourceViewportId) {
      return true;
    }

    if (linkPolicy === 'explicit') {
      return !!explicitLinkedViewportIds?.includes(viewport.id);
    }

    if (linkPolicy === 'frameOfReferenceUID') {
      if (!frameOfReferenceUID) {
        return true;
      }
      return viewport.getFrameOfReferenceUID?.() === frameOfReferenceUID;
    }

    // 'toolGroup'
    return true;
  }

  private _renderLinkedViewports(): void {
    const viewportIds = this._getLinkedViewports().map(
      (viewport) => viewport.id
    );
    if (viewportIds.length) {
      triggerAnnotationRenderForViewportIds(viewportIds);
    }
  }

  /**
   * Returns the canvas position of the marker in the given viewport, or null
   * when the marker is not visible there (hidden, unlinked or non-planar
   * viewport, or off-slice with 'hide' display).
   */
  private _getMarkerCanvasPosition(
    viewport: Types.IViewport
  ): Types.Point2 | null {
    const { worldPoint, visible } = this._state;
    const { showIn2D, offSliceDisplay, offSliceToleranceMm } =
      this.configuration;

    if (!worldPoint || !visible || !showIn2D) {
      return null;
    }

    if (!this._isPlanarViewport(viewport)) {
      return null;
    }

    if (!this._isViewportLinked(viewport)) {
      return null;
    }

    const plane = getViewportPlane(viewport);
    if (!plane) {
      return null;
    }

    const distanceMm = distancePointToPlane(worldPoint, plane);
    const toleranceMm = this._getEffectiveOffSliceTolerance(
      viewport,
      plane,
      offSliceToleranceMm
    );
    if (Math.abs(distanceMm) > toleranceMm && offSliceDisplay === 'hide') {
      return null;
    }

    const projected = projectPointToPlane(worldPoint, plane);
    const canvasPoint = viewport.worldToCanvas(projected);

    if (!canvasPoint || !canvasPoint.every((c) => Number.isFinite(c))) {
      return null;
    }

    return canvasPoint;
  }

  /**
   * Resolves the world point a set interaction should store for a click at
   * `world` in `viewport`. On viewports rendering an intensity-projection
   * slab (MIP/MinIP) the point snaps to the extremal-intensity location
   * along the view normal within the slab (when snapToSlabIntensity is on);
   * everywhere else the clicked world point is used as-is.
   */
  private _resolveInteractionWorldPoint(
    viewport: Types.IViewport,
    world: Types.Point3
  ): Types.Point3 {
    if (!this.configuration.snapToSlabIntensity) {
      return world;
    }

    return pickIntensityPointInSlab(viewport, world) ?? world;
  }

  /**
   * Reads the viewport's source display-set slab thickness (mm); 0 when the
   * viewport has none (non-generic viewports, stacks, plain slices).
   */
  private _getSourceSlabThicknessMm(viewport: Types.IViewport): number {
    if (!csUtils.viewportSupportsDisplaySetPresentation(viewport)) {
      return 0;
    }

    const dataId = viewport.getSourceDataId();
    if (!dataId) {
      return 0;
    }

    const presentation = (
      viewport as unknown as Types.IGenericViewport
    ).getDisplaySetPresentation(dataId) as
      | { slabThickness?: number }
      | undefined;
    const slabThickness = presentation?.slabThickness;

    return Number.isFinite(slabThickness) && slabThickness > 0
      ? slabThickness
      : 0;
  }

  /**
   * The effective off-slice tolerance for one viewport: at least half its
   * slice spacing along the view-plane normal, and at least half its slab
   * thickness. A viewport snapped to its closest slice (all it can do) then
   * shows the point as in-slice instead of flickering dashed/solid while
   * the point moves across a coarse grid, and a slab viewport (e.g. MIP)
   * shows any point inside its rendered slab as in-slice.
   */
  private _getEffectiveOffSliceTolerance(
    viewport: Types.IViewport,
    plane: { normal: Types.Point3 },
    baseToleranceMm: number
  ): number {
    const slabThickness = this._getSourceSlabThicknessMm(viewport);
    const toleranceMm = Math.max(
      baseToleranceMm,
      slabThickness > 0 ? slabThickness / 2 + 1e-2 : 0
    );

    let spacing: number[] | undefined;
    try {
      spacing = (viewport as Types.IVolumeViewport).getImageData?.()
        ?.spacing as number[] | undefined;
    } catch {
      spacing = undefined;
    }

    if (!spacing || spacing.length !== 3) {
      return toleranceMm;
    }

    const [nx, ny, nz] = plane.normal;
    const spacingAlongNormal =
      Math.abs(nx) * spacing[0] +
      Math.abs(ny) * spacing[1] +
      Math.abs(nz) * spacing[2];

    if (!Number.isFinite(spacingAlongNormal) || spacingAlongNormal <= 0) {
      return toleranceMm;
    }

    return Math.max(toleranceMm, spacingAlongNormal / 2 + 1e-2);
  }

  /**
   * Keeps the single render-artifact annotation in sync with the world point.
   * The annotation only exists so the standard annotation interaction
   * pipeline (hover/drag hit-testing) works: it is never the authoritative
   * state, which lives in `_state.worldPoint`.
   */
  private _syncAnnotation(): void {
    const { worldPoint, frameOfReferenceUID } = this._state;

    if (!worldPoint) {
      if (this._annotation?.annotationUID) {
        removeAnnotation(this._annotation.annotationUID);
      }
      this._annotation = null;
      return;
    }

    if (
      this._annotation &&
      frameOfReferenceUID &&
      this._annotation.metadata.FrameOfReferenceUID !== frameOfReferenceUID
    ) {
      // The point moved to a different frame of reference: recreate the
      // annotation in the new annotation group.
      removeAnnotation(this._annotation.annotationUID);
      this._annotation = null;
    }

    if (this._annotation) {
      this._annotation.data.handles.points = [
        [worldPoint[0], worldPoint[1], worldPoint[2]],
      ];
      this._annotation.invalidated = true;
      return;
    }

    if (!frameOfReferenceUID) {
      // Without a frame of reference the annotation cannot be grouped; the
      // tool still renders from its instance state.
      return;
    }

    const annotation: WorldCrosshairAnnotation = {
      highlighted: false,
      invalidated: true,
      metadata: {
        toolName: this.getToolName(),
        FrameOfReferenceUID: frameOfReferenceUID,
      },
      data: {
        handles: {
          points: [[worldPoint[0], worldPoint[1], worldPoint[2]]],
        },
      },
    } as WorldCrosshairAnnotation;

    addAnnotation(annotation, frameOfReferenceUID);
    this._annotation = annotation;
  }

  private _getAnnotationOrDetached(): WorldCrosshairAnnotation {
    if (this._annotation) {
      return this._annotation;
    }

    // Detached placeholder so the interaction dispatcher has an annotation
    // shaped object to work with; it is never added to the annotation state.
    return {
      annotationUID: csUtils.uuidv4() as string,
      highlighted: false,
      invalidated: false,
      metadata: {
        toolName: this.getToolName(),
      },
      data: {
        handles: { points: [] },
      },
    } as WorldCrosshairAnnotation;
  }

  private _getEventDetail(): WorldCrosshairPointChangedEventDetail {
    const { sourceViewportId, sourceRenderingEngineId, frameOfReferenceUID } =
      this._state;

    return {
      toolGroupId: this.toolGroupId,
      worldPoint: this.getWorldPoint(),
      sourceViewportId,
      sourceRenderingEngineId,
      frameOfReferenceUID,
    };
  }
}

WorldCrosshairTool.toolName = 'WorldCrosshair';
export default WorldCrosshairTool;
