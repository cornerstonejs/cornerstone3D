import { vec3 } from 'gl-matrix';
import {
  getEnabledElement,
  getEnabledElementByIds,
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
  drawTextBox as drawTextBoxSvg,
} from '../drawingSvg';
import {
  resetElementCursor,
  hideElementCursor,
} from '../cursors/elementCursor';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import getViewportICamera from '../utilities/getViewportICamera';
import {
  getViewportPlane,
  distancePointToPlane,
  projectPointToPlane,
} from '../utilities/spatial';
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

export type WorldCrosshairToolConfiguration = {
  pointColor: string;
  pointRadius: number;

  offSliceDisplay: WorldCrosshairOffSliceDisplay;
  offSliceToleranceMm: number;

  jumpOnSet: boolean;
  jumpMode: WorldCrosshairJumpMode;
  preservePanZoom: boolean;

  liveUpdateOnShiftMouseMove: boolean;
  liveJumpOnShiftMouseMove: boolean;

  showIn2D: boolean;

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

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        pointColor: 'rgb(255, 255, 0)',
        pointRadius: 4,

        offSliceDisplay: 'projectedWithDistance',
        offSliceToleranceMm: 0.5,

        jumpOnSet: true,
        jumpMode: 'sliceOnly',
        preservePanZoom: true,

        liveUpdateOnShiftMouseMove: true,
        liveJumpOnShiftMouseMove: true,

        showIn2D: true,

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
    state.isInteractingWithTool = false;

    if (this._annotation?.annotationUID) {
      removeAnnotation(this._annotation.annotationUID);
    }
    this._annotation = null;

    this._renderLinkedViewports();
  }

  // ===================================================================
  // Interactions
  // ===================================================================

  /**
   * Called on mouse down / touch start in empty space: sets the world point
   * from the event world coordinates and starts a drag so the point can be
   * refined while the button is held. Only planar generic viewports
   * participate.
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

    const { viewport, renderingEngine, FrameOfReferenceUID } = enabledElement;

    if (!this._isPlanarViewport(viewport)) {
      return this._getAnnotationOrDetached();
    }

    this.setWorldPoint(currentPoints.world, {
      sourceViewportId: viewport.id,
      sourceRenderingEngineId: renderingEngine?.id,
      frameOfReferenceUID: FrameOfReferenceUID,
    });

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
        this.setWorldPoint(currentPoints.world, {
          sourceViewportId: viewport.id,
          sourceRenderingEngineId: enabledElement.renderingEngine?.id,
          frameOfReferenceUID: enabledElement.FrameOfReferenceUID,
          jump: this.configuration.liveJumpOnShiftMouseMove,
        });
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

    this.setWorldPoint(currentPoints.world, {
      sourceViewportId: viewport.id,
      sourceRenderingEngineId: renderingEngine?.id,
      frameOfReferenceUID: FrameOfReferenceUID,
    });
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
   * Renders the marker for one linked planar viewport. The marker is drawn
   * at the projection of the world point onto the viewport plane. A point
   * that is not on the currently displayed slice is drawn dashed/faded (and
   * optionally labeled with its signed distance) so it never looks like it
   * lies on the slice.
   */
  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    const { viewport } = enabledElement;
    const { worldPoint, visible } = this._state;
    const {
      showIn2D,
      pointColor,
      pointRadius,
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

    const inSlice = Math.abs(distanceMm) <= offSliceToleranceMm;

    if (!inSlice && offSliceDisplay === 'hide') {
      return false;
    }

    const annotationUID =
      this._annotation?.annotationUID ?? `WorldCrosshair-${this.toolGroupId}`;
    const highlighted = !!this._annotation?.highlighted;

    if (inSlice) {
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        'marker',
        canvasPoint,
        pointRadius,
        {
          color: pointColor,
          fill: pointColor,
          width: highlighted ? 2 : 1,
        },
        `${annotationUID}-marker`
      );
    } else {
      // Off-slice: dashed, unfilled and faded so it cannot be mistaken for a
      // point lying on this slice.
      drawCircleSvg(
        svgDrawingHelper,
        annotationUID,
        'marker-projected',
        canvasPoint,
        pointRadius,
        {
          color: pointColor,
          fill: 'transparent',
          width: highlighted ? 2 : 1,
          lineDash: '3,3',
          strokeOpacity: 0.7,
        },
        `${annotationUID}-marker-projected`
      );

      if (offSliceDisplay === 'projectedWithDistance') {
        const sign = distanceMm >= 0 ? '+' : '-';
        const label = `${sign}${Math.abs(distanceMm).toFixed(1)} mm`;

        drawTextBoxSvg(
          svgDrawingHelper,
          annotationUID,
          'marker-distance',
          [label],
          [canvasPoint[0] + pointRadius + 6, canvasPoint[1] - pointRadius - 6],
          {
            color: pointColor,
          }
        );
      }
    }

    return true;
  };

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
   * The viewport is never rotated and slab thickness is never touched.
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
      viewport.setViewReference({
        cameraFocalPoint: [worldPoint[0], worldPoint[1], worldPoint[2]],
      } as Types.ViewReference);
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

    viewport.setViewReference({
      cameraFocalPoint: [
        targetFocalPoint[0],
        targetFocalPoint[1],
        targetFocalPoint[2],
      ],
    } as Types.ViewReference);
    viewport.render();
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

  private _isViewportLinked(viewport: Types.IViewport): boolean {
    return this._getLinkedViewports().some((vp) => vp.id === viewport.id);
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
    if (
      Math.abs(distanceMm) > offSliceToleranceMm &&
      offSliceDisplay === 'hide'
    ) {
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
