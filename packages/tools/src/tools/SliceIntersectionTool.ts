import { mat4, vec2, vec3 } from 'gl-matrix';
import {
  getEnabledElement,
  getEnabledElementByIds,
  eventTarget,
  triggerEvent,
  utilities as csUtils,
  CONSTANTS,
  Enums,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';

import { AnnotationTool } from './base';
import { getToolGroup } from '../store/ToolGroupManager';
import { state } from '../store/state';
import { Events } from '../enums';
import {
  addAnnotation,
  getAnnotations,
  removeAnnotation,
} from '../stateManagement/annotation/annotationState';
import {
  drawCircle as drawCircleSvg,
  drawLine as drawLineSvg,
} from '../drawingSvg';
import {
  resetElementCursor,
  hideElementCursor,
} from '../cursors/elementCursor';
import triggerAnnotationRenderForViewportIds from '../utilities/triggerAnnotationRenderForViewportIds';
import getViewportICamera from '../utilities/getViewportICamera';
import * as lineSegment from '../utilities/math/line';
import {
  getViewportPlane,
  intersectPlanes,
  distancePointToPlane,
  clipWorldLineToViewportCanvas,
  areViewportsSpatiallyLinked,
  translateViewportAlongNormal,
} from '../utilities/spatial';
import type { Plane, WorldLine, SpatialLinkPolicy } from '../utilities/spatial';
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
const { RENDERING_DEFAULTS } = CONSTANTS;

/** |dot(normalA, normalB)| above this means "same orientation" (~2.5 deg). */
const SAME_ORIENTATION_TOLERANCE = 0.999;

/** Canvas proximity (px) used for line hover/hit testing. */
const LINE_PROXIMITY = 6;

/** Minimum canvas offset (px) for slab handles when the slab is collapsed. */
const MIN_SLAB_HANDLE_CANVAS_OFFSET = 12;

/** Safety cap for intermediate slice lines, to avoid line spam. */
const MAX_INTERMEDIATE_LINES = 50;

export type SliceIntersectionSourcePolicy =
  | 'activeViewport'
  | 'mprTriad'
  | 'selectedViewports'
  | 'allLinked'
  | 'debugAll';

export type SliceIntersectionOperation =
  | 'translate'
  | 'rotate'
  | 'slabThickness';

export type SliceIntersectionState = {
  toolGroupId: string;
  sourcePolicy: SliceIntersectionSourcePolicy;
  selectedSourceViewportIds: string[];
  activeSourceViewportId?: string;
  activeTargetViewportId?: string;
  activeOperation?: SliceIntersectionOperation | null;
};

export type SliceIntersectionRotationPivotPolicy =
  | 'currentIntersection'
  | 'viewportCenter'
  | 'worldCrosshairPointIfAvailable';

export type SliceIntersectionToolConfiguration = {
  sourcePolicy: SliceIntersectionSourcePolicy;
  selectedSourceViewportIds: string[];

  maxSourceViewports: number;

  showSameOrientation: boolean;
  showParallelPlanes: boolean;
  showCurrentSliceLine: boolean;
  showBoundaryLines: boolean;
  showIntermediateLines: boolean;

  showSlabThickness: boolean;
  draggable: boolean;
  rotatable: boolean;
  slabThicknessControls: boolean;

  lineWidth: number;
  activeLineWidth: number;
  handleRadius: number;

  rotationPivotPolicy: SliceIntersectionRotationPivotPolicy;

  linkPolicy: SpatialLinkPolicy;
  /** Viewport links considered linked when linkPolicy is 'explicit'. */
  explicitLinks: Array<{ sourceViewportId: string; targetViewportId: string }>;

  /**
   * When true, double clicking an intersection line sets the
   * WorldCrosshairTool world point (if that tool exists in the tool group) to
   * the clicked location on the line. Optional integration: this tool never
   * requires the WorldCrosshairTool.
   */
  setWorldCrosshairOnIntersectionDoubleClick: boolean;
  /**
   * When true, double clicking an intersection line centers the target
   * viewport on the clicked location of the line.
   */
  jumpToIntersectionOnDoubleClick: boolean;

  /** Blend mode applied when a slab thickness > minimum is set. */
  slabThicknessBlendMode: Enums.BlendModes;

  getReferenceLineColor?: (
    sourceViewportId: string,
    targetViewportId: string
  ) => string;
  getReferenceLineControllable?: (
    sourceViewportId: string,
    targetViewportId: string
  ) => boolean;
};

export type SliceIntersectionManipulationEventDetail = {
  toolGroupId: string;
  sourceViewportId: string;
  targetViewportId: string;
  operation: SliceIntersectionOperation;
};

export type SliceIntersectionSourceChangedEventDetail = {
  toolGroupId: string;
  sourcePolicy: SliceIntersectionSourcePolicy;
  activeSourceViewportId?: string;
  selectedSourceViewportIds: string[];
};

export type SliceIntersectionLineSelectedEventDetail = {
  toolGroupId: string;
  sourceViewportId: string;
  targetViewportId: string;
};

export type SliceIntersectionAnnotation = Annotation & {
  data: {
    viewportId: string;
    handles: {
      points: Types.Point3[];
    };
  };
};

/**
 * One intersection line rendered into a target viewport, cached per render
 * pass for hit testing. All geometry is derived from the actual source and
 * target camera planes: it is recomputed on every render and never persisted.
 */
export type RenderedIntersectionLine = {
  sourceViewportId: string;
  targetViewportId: string;
  /** The world-space plane-plane intersection line. */
  line: WorldLine;
  /** The source viewport slice plane the line was computed from. */
  sourcePlane: Plane;
  /** Center line clipped to the target canvas. */
  canvasPoints: [Types.Point2, Types.Point2];
  /** Slab boundary segments (present when slab thickness rendering is on). */
  slabLineSegments: Array<[Types.Point2, Types.Point2]>;
  /** Rotation handle canvas positions (only for the active line). */
  rotateHandles: Types.Point2[];
  /** Slab thickness handle canvas positions (only for the active line). */
  slabHandles: Types.Point2[];
  controllable: boolean;
  color: string;
  isActive: boolean;
};

type PendingHandle = {
  operation: 'rotate' | 'slabThickness';
  lineInfo: RenderedIntersectionLine;
};

type EditData = {
  targetViewportId: string;
  sourceViewportId: string;
  operation: SliceIntersectionOperation;
  pivotWorld?: Types.Point3;
  rotationAxis?: Types.Point3;
};

/**
 * Default per-source line colors, keyed by the dominant axis of the source
 * plane normal (axial-ish red, sagittal-ish yellow, coronal-ish green).
 */
function defaultColorForSourcePlane(sourcePlane: Plane | null): string {
  if (!sourcePlane) {
    return 'rgb(0, 200, 0)';
  }

  const [x, y, z] = sourcePlane.normal.map(Math.abs);

  if (z >= x && z >= y) {
    return 'rgb(200, 60, 60)';
  }
  if (x >= y && x >= z) {
    return 'rgb(220, 200, 60)';
  }
  return 'rgb(60, 200, 60)';
}

/**
 * SliceIntersectionTool ("Slice Intersections") renders and manipulates slice
 * plane intersection lines: where does another viewport's slice plane
 * intersect the current viewport's slice plane?
 *
 * Every rendered line is computed from the actual plane-plane intersection of
 * the source and target viewport camera planes. The tool stores no persistent
 * world point, never reads the legacy CrosshairsTool.toolCenter and never
 * centers lines on the WorldCrosshairTool point.
 *
 * Lines can be dragged to translate the source viewport slice plane along its
 * normal, rotated via rotation handles (volume-backed sources only), and the
 * source viewport slab thickness can be adjusted via slab handles. Lines are
 * only drawn between spatially linked viewports, and the default
 * 'activeViewport' source policy keeps large viewport grids readable.
 *
 * The tool targets the Generic ("next") viewport architecture exclusively: it
 * only operates on direct PLANAR_NEXT viewports through the native view-state
 * API (getResolvedView / setViewReference / setViewState /
 * setDisplaySetPresentation). Legacy stack and volume viewports (and their
 * compatibility adapters) are ignored, and the tool does not render in 3D
 * viewports (v1).
 */
class SliceIntersectionTool extends AnnotationTool {
  static toolName;
  /** User-facing label for this tool. */
  static toolLabel = 'Slice Intersections';

  private _activeSourceViewportId?: string;
  private _activeTargetViewportId?: string;
  private _activeOperation: SliceIntersectionOperation | null = null;

  /** Rendered line cache per target viewport id, refreshed on every render. */
  private _renderedLines = new Map<string, RenderedIntersectionLine[]>();
  private _pendingHandle: PendingHandle | null = null;
  private _editData: EditData | null = null;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        sourcePolicy: 'activeViewport',
        selectedSourceViewportIds: [],

        maxSourceViewports: 3,

        showSameOrientation: false,
        showParallelPlanes: false,
        showCurrentSliceLine: true,
        showBoundaryLines: false,
        showIntermediateLines: false,

        showSlabThickness: true,
        draggable: true,
        rotatable: true,
        slabThicknessControls: true,

        lineWidth: 1,
        activeLineWidth: 2.5,
        handleRadius: 3,

        rotationPivotPolicy: 'currentIntersection',

        linkPolicy: 'frameOfReferenceUID',
        explicitLinks: [],

        setWorldCrosshairOnIntersectionDoubleClick: false,
        jumpToIntersectionOnDoubleClick: false,

        slabThicknessBlendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  // ===================================================================
  // Public API
  // ===================================================================

  /**
   * Sets the active source viewport (the viewport whose slice plane generates
   * lines in the other viewports under the 'activeViewport' source policy,
   * and the source of the active line otherwise).
   */
  public setActiveSourceViewport(viewportId: string | undefined): void {
    if (this._activeSourceViewportId === viewportId) {
      return;
    }

    this._activeSourceViewportId = viewportId;
    this._emitSourceChanged();
    this._renderToolViewports();
  }

  /**
   * Sets the source viewport ids used by the 'selectedViewports' policy.
   */
  public setSelectedSourceViewportIds(viewportIds: string[]): void {
    this.configuration.selectedSourceViewportIds = [...(viewportIds ?? [])];
    this._emitSourceChanged();
    this._renderToolViewports();
  }

  /**
   * Sets the source policy.
   */
  public setSourcePolicy(sourcePolicy: SliceIntersectionSourcePolicy): void {
    this.configuration.sourcePolicy = sourcePolicy;
    this._emitSourceChanged();
    this._renderToolViewports();
  }

  /**
   * Returns a copy of the tool state.
   */
  public getState(): SliceIntersectionState {
    return {
      toolGroupId: this.toolGroupId,
      sourcePolicy: this.configuration.sourcePolicy,
      selectedSourceViewportIds: [
        ...(this.configuration.selectedSourceViewportIds ?? []),
      ],
      activeSourceViewportId: this._activeSourceViewportId,
      activeTargetViewportId: this._activeTargetViewportId,
      activeOperation: this._activeOperation,
    };
  }

  // ===================================================================
  // Tool lifecycle
  // ===================================================================

  onSetToolEnabled(): void {
    this._initDefaultActiveSourceViewport();
    this._renderToolViewports();
  }

  onSetToolActive(): void {
    this.onSetToolEnabled();
  }

  onSetToolPassive(): void {
    this.onSetToolEnabled();
  }

  onSetToolDisabled(): void {
    this._editData = null;
    this._pendingHandle = null;
    this._activeOperation = null;
    state.isInteractingWithTool = false;
    this._renderedLines.clear();

    this._getViewportsInfo().forEach(({ viewportId, renderingEngineId }) => {
      const enabledElement = getEnabledElementByIds(
        viewportId,
        renderingEngineId
      );
      if (!enabledElement) {
        return;
      }

      const annotations = getAnnotations(
        this.getToolName(),
        enabledElement.viewport.element
      );
      annotations?.forEach((annotation) => {
        removeAnnotation(annotation.annotationUID);
      });
    });
  }

  /**
   * Lines are pure derivations of the source/target cameras, so a camera
   * change anywhere just needs a re-render of the tool viewports. No tool
   * state is recomputed or stored here.
   *
   * Under the 'activeViewport' source policy, a direct camera change in a
   * viewport (e.g. the user scrolling it) also makes that viewport the
   * active source; camera changes caused by tool manipulation are ignored.
   */
  onCameraModified = (evt: Types.EventTypes.CameraModifiedEvent): void => {
    if (
      this.configuration.sourcePolicy === 'activeViewport' &&
      !state.isInteractingWithTool
    ) {
      const viewportId = evt.detail?.viewportId;
      if (
        viewportId &&
        viewportId !== this._activeSourceViewportId &&
        this._getViewportsInfo().some(
          (info) => info.viewportId === viewportId
        )
      ) {
        const viewport = this._getViewportById(viewportId);
        if (viewport && this._isPlanarViewport(viewport)) {
          this._activeSourceViewportId = viewportId;
          this._emitSourceChanged();
        }
      }
    }

    this._renderToolViewports();
  };

  // ===================================================================
  // Rendering
  // ===================================================================

  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    const { viewport: targetViewport } = enabledElement;

    const lines = this._computeLinesForTarget(targetViewport);
    this._renderedLines.set(targetViewport.id, lines);

    if (!lines.length) {
      return false;
    }

    const annotation = this._getOrCreateViewportAnnotation(targetViewport);
    const annotationUID =
      annotation?.annotationUID ??
      `SliceIntersection-${targetViewport.id}`;

    const { lineWidth, activeLineWidth, handleRadius, showCurrentSliceLine } =
      this.configuration;

    lines.forEach((lineInfo) => {
      const { sourceViewportId, canvasPoints, color, isActive } = lineInfo;
      const width = isActive ? activeLineWidth : lineWidth;

      if (showCurrentSliceLine) {
        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          `line-${sourceViewportId}`,
          canvasPoints[0],
          canvasPoints[1],
          {
            color,
            width,
          },
          `${annotationUID}-line-${sourceViewportId}`
        );
      }

      lineInfo.slabLineSegments.forEach((segment, index) => {
        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          `slab-${sourceViewportId}-${index}`,
          segment[0],
          segment[1],
          {
            color,
            width: 1,
            lineDash: '4,4',
            strokeOpacity: 0.8,
          }
        );
      });

      lineInfo.rotateHandles.forEach((handleCanvas, index) => {
        drawCircleSvg(
          svgDrawingHelper,
          annotationUID,
          `rotate-handle-${sourceViewportId}-${index}`,
          handleCanvas,
          handleRadius,
          {
            color,
            fill: color,
          }
        );
      });

      lineInfo.slabHandles.forEach((handleCanvas, index) => {
        drawCircleSvg(
          svgDrawingHelper,
          annotationUID,
          `slab-handle-${sourceViewportId}-${index}`,
          handleCanvas,
          handleRadius,
          {
            color,
            fill: 'transparent',
          }
        );
      });
    });

    return true;
  };

  /**
   * Computes the intersection lines to render into a target viewport. Pure
   * geometry: every line comes from the actual plane-plane intersection of
   * the source and target camera planes. Never centered on any stored point.
   */
  protected _computeLinesForTarget(
    targetViewport: Types.IViewport
  ): RenderedIntersectionLine[] {
    if (!targetViewport || !this._isPlanarViewport(targetViewport)) {
      // Native-next only: legacy viewports and 3D viewports never render
      // intersection lines.
      return [];
    }

    const targetPlane = getViewportPlane(targetViewport);
    if (!targetPlane) {
      return [];
    }

    const sourceViewports = this._resolveSourceViewports(
      targetViewport,
      targetPlane
    );

    const lines: RenderedIntersectionLine[] = [];

    sourceViewports.forEach((sourceViewport) => {
      const lineInfo = this._computeIntersectionForPair(
        targetViewport,
        targetPlane,
        sourceViewport
      );
      if (lineInfo) {
        lines.push(lineInfo);
      }
    });

    return lines;
  }

  private _computeIntersectionForPair(
    targetViewport: Types.IViewport,
    targetPlane: Plane,
    sourceViewport: Types.IViewport
  ): RenderedIntersectionLine | null {
    const sourcePlane = getViewportPlane(sourceViewport);
    if (!sourcePlane) {
      return null;
    }

    const absDot = Math.abs(
      vec3.dot(targetPlane.normal, sourcePlane.normal)
    );
    const sameOrientation = absDot > SAME_ORIENTATION_TOLERANCE;

    if (
      sameOrientation &&
      !this.configuration.showSameOrientation &&
      !this.configuration.showParallelPlanes
    ) {
      return null;
    }

    const line = intersectPlanes(targetPlane, sourcePlane);
    if (!line) {
      // Truly parallel planes have no intersection line to draw.
      return null;
    }

    const canvasPoints = clipWorldLineToViewportCanvas(line, targetViewport);
    if (!canvasPoints) {
      return null;
    }

    const { getReferenceLineColor, getReferenceLineControllable } =
      this.configuration;

    const color =
      getReferenceLineColor?.(sourceViewport.id, targetViewport.id) ??
      defaultColorForSourcePlane(sourcePlane);
    const controllable =
      getReferenceLineControllable?.(sourceViewport.id, targetViewport.id) ??
      true;

    const isActive =
      this._activeSourceViewportId === sourceViewport.id &&
      this._activeTargetViewportId === targetViewport.id;

    const lineInfo: RenderedIntersectionLine = {
      sourceViewportId: sourceViewport.id,
      targetViewportId: targetViewport.id,
      line,
      sourcePlane,
      canvasPoints,
      slabLineSegments: [],
      rotateHandles: [],
      slabHandles: [],
      controllable,
      color,
      isActive,
    };

    this._appendSlabGeometry(
      lineInfo,
      targetViewport,
      targetPlane,
      sourceViewport,
      sourcePlane
    );
    this._appendBoundaryGeometry(
      lineInfo,
      targetViewport,
      targetPlane,
      sourceViewport,
      sourcePlane
    );

    if (isActive && controllable) {
      this._appendHandles(lineInfo, targetViewport, sourceViewport);
    }

    return lineInfo;
  }

  /**
   * Intersects a plane parallel to the source plane (offset along the source
   * normal) with the target plane and clips it to the target canvas.
   */
  private _clipOffsetPlaneIntersection(
    targetViewport: Types.IViewport,
    targetPlane: Plane,
    sourcePlane: Plane,
    offset: number
  ): [Types.Point2, Types.Point2] | null {
    const offsetPlane: Plane = {
      normal: sourcePlane.normal,
      point: [
        sourcePlane.point[0] + sourcePlane.normal[0] * offset,
        sourcePlane.point[1] + sourcePlane.normal[1] * offset,
        sourcePlane.point[2] + sourcePlane.normal[2] * offset,
      ],
    };

    const line = intersectPlanes(targetPlane, offsetPlane);
    if (!line) {
      return null;
    }

    return clipWorldLineToViewportCanvas(line, targetViewport);
  }

  /**
   * Slab thickness rendering: two dashed lines at +/- slabThickness / 2
   * relative to the source slice plane. The slab thickness itself is read
   * from the source viewport display-set presentation and never stored on
   * this tool.
   */
  private _appendSlabGeometry(
    lineInfo: RenderedIntersectionLine,
    targetViewport: Types.IViewport,
    targetPlane: Plane,
    sourceViewport: Types.IViewport,
    sourcePlane: Plane
  ): void {
    if (
      !this.configuration.showSlabThickness ||
      !this._isVolumeModeViewport(sourceViewport)
    ) {
      return;
    }

    const slabThickness = this._getSourceSlabThickness(sourceViewport);
    if (
      !slabThickness ||
      slabThickness <= RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS
    ) {
      return;
    }

    [slabThickness / 2, -slabThickness / 2].forEach((offset) => {
      const segment = this._clipOffsetPlaneIntersection(
        targetViewport,
        targetPlane,
        sourcePlane,
        offset
      );
      if (segment) {
        lineInfo.slabLineSegments.push(segment);
      }
    });
  }

  /**
   * Optional boundary/intermediate slice lines derived from the source
   * viewport image bounds along the source normal.
   */
  private _appendBoundaryGeometry(
    lineInfo: RenderedIntersectionLine,
    targetViewport: Types.IViewport,
    targetPlane: Plane,
    sourceViewport: Types.IViewport,
    sourcePlane: Plane
  ): void {
    const { showBoundaryLines, showIntermediateLines } = this.configuration;
    if (!showBoundaryLines && !showIntermediateLines) {
      return;
    }

    const extent = this._getSourceExtentAlongNormal(
      sourceViewport,
      sourcePlane
    );
    if (!extent) {
      return;
    }

    const { minOffset, maxOffset, spacing } = extent;
    const offsets: number[] = [];

    if (showBoundaryLines) {
      offsets.push(minOffset, maxOffset);
    }

    if (showIntermediateLines && spacing > 0) {
      const range = maxOffset - minOffset;
      const step = Math.max(spacing, range / MAX_INTERMEDIATE_LINES);
      for (
        let offset = Math.ceil(minOffset / step) * step;
        offset < maxOffset;
        offset += step
      ) {
        if (Math.abs(offset) > 1e-6) {
          offsets.push(offset);
        }
      }
    }

    offsets.forEach((offset) => {
      const segment = this._clipOffsetPlaneIntersection(
        targetViewport,
        targetPlane,
        sourcePlane,
        offset
      );
      if (segment) {
        lineInfo.slabLineSegments.push(segment);
      }
    });
  }

  private _getSourceExtentAlongNormal(
    sourceViewport: Types.IViewport,
    sourcePlane: Plane
  ): { minOffset: number; maxOffset: number; spacing: number } | null {
    let imageData;
    try {
      imageData = (
        sourceViewport as Types.IVolumeViewport
      ).getImageData?.();
    } catch {
      return null;
    }

    const bounds = imageData?.imageData?.getBounds?.();
    if (!bounds || bounds.length !== 6) {
      return null;
    }

    const [xMin, xMax, yMin, yMax, zMin, zMax] = bounds;
    const corners: Types.Point3[] = [
      [xMin, yMin, zMin],
      [xMax, yMin, zMin],
      [xMin, yMax, zMin],
      [xMax, yMax, zMin],
      [xMin, yMin, zMax],
      [xMax, yMin, zMax],
      [xMin, yMax, zMax],
      [xMax, yMax, zMax],
    ];

    let minOffset = Infinity;
    let maxOffset = -Infinity;
    corners.forEach((corner) => {
      const distance = distancePointToPlane(corner, sourcePlane);
      minOffset = Math.min(minOffset, distance);
      maxOffset = Math.max(maxOffset, distance);
    });

    if (!Number.isFinite(minOffset) || !Number.isFinite(maxOffset)) {
      return null;
    }

    const spacingArray = imageData?.spacing ?? [];
    const spacing = Math.min(
      ...spacingArray.filter((s) => Number.isFinite(s) && s > 0),
      Infinity
    );

    return {
      minOffset,
      maxOffset,
      spacing: Number.isFinite(spacing) ? spacing : 0,
    };
  }

  private _appendHandles(
    lineInfo: RenderedIntersectionLine,
    targetViewport: Types.IViewport,
    sourceViewport: Types.IViewport
  ): void {
    const { rotatable, slabThicknessControls, showSlabThickness } =
      this.configuration;
    const [start, end] = lineInfo.canvasPoints;

    // Rotation and slab manipulation require a volume-backed source: image
    // stack planes cannot be reoriented and have no slab.
    const volumeMode = this._isVolumeModeViewport(sourceViewport);

    if (rotatable && volumeMode) {
      lineInfo.rotateHandles = [0.25, 0.75].map((fraction) => [
        start[0] + (end[0] - start[0]) * fraction,
        start[1] + (end[1] - start[1]) * fraction,
      ]);
    }

    if (slabThicknessControls && showSlabThickness && volumeMode) {
      lineInfo.slabHandles = this._computeSlabHandles(
        lineInfo,
        targetViewport,
        sourceViewport
      );
    }
  }

  private _computeSlabHandles(
    lineInfo: RenderedIntersectionLine,
    targetViewport: Types.IViewport,
    sourceViewport: Types.IViewport
  ): Types.Point2[] {
    const [start, end] = lineInfo.canvasPoints;
    const midCanvas: Types.Point2 = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
    ];

    const slabThickness = this._getSourceSlabThickness(sourceViewport);
    const midWorld = targetViewport.canvasToWorld(midCanvas);
    const { normal } = lineInfo.sourcePlane;

    const plusWorld: Types.Point3 = [
      midWorld[0] + normal[0] * (slabThickness / 2),
      midWorld[1] + normal[1] * (slabThickness / 2),
      midWorld[2] + normal[2] * (slabThickness / 2),
    ];
    const plusCanvas = targetViewport.worldToCanvas(plusWorld);

    const canvasOffset = Math.hypot(
      plusCanvas[0] - midCanvas[0],
      plusCanvas[1] - midCanvas[1]
    );

    if (canvasOffset >= MIN_SLAB_HANDLE_CANVAS_OFFSET) {
      const minusWorld: Types.Point3 = [
        midWorld[0] - normal[0] * (slabThickness / 2),
        midWorld[1] - normal[1] * (slabThickness / 2),
        midWorld[2] - normal[2] * (slabThickness / 2),
      ];
      return [plusCanvas, targetViewport.worldToCanvas(minusWorld)];
    }

    // Slab collapsed to (near) minimum: place grab points at a fixed canvas
    // offset perpendicular to the line so the slab is still adjustable.
    const direction = vec2.normalize(
      vec2.create(),
      vec2.subtract(vec2.create(), end, start)
    );
    const perpendicular: Types.Point2 = [-direction[1], direction[0]];

    return [
      [
        midCanvas[0] + perpendicular[0] * MIN_SLAB_HANDLE_CANVAS_OFFSET,
        midCanvas[1] + perpendicular[1] * MIN_SLAB_HANDLE_CANVAS_OFFSET,
      ],
      [
        midCanvas[0] - perpendicular[0] * MIN_SLAB_HANDLE_CANVAS_OFFSET,
        midCanvas[1] - perpendicular[1] * MIN_SLAB_HANDLE_CANVAS_OFFSET,
      ],
    ];
  }

  // ===================================================================
  // Source viewport resolution
  // ===================================================================

  /**
   * Resolves which source viewports may generate lines in the given target
   * viewport, per the configured source policy. Sources must always be
   * spatially linked to the target, and 3D viewports never participate.
   */
  protected _resolveSourceViewports(
    targetViewport: Types.IViewport,
    targetPlane: Plane
  ): Types.IViewport[] {
    const {
      sourcePolicy,
      selectedSourceViewportIds,
      maxSourceViewports,
      linkPolicy,
      explicitLinks,
    } = this.configuration;

    const candidates = this._getToolGroupViewports().filter(
      (viewport) =>
        viewport.id !== targetViewport.id &&
        this._isPlanarViewport(viewport) &&
        areViewportsSpatiallyLinked(viewport, targetViewport, {
          policy: linkPolicy,
          explicitLinks,
        })
    );

    switch (sourcePolicy) {
      case 'activeViewport': {
        return candidates.filter(
          (viewport) => viewport.id === this._activeSourceViewportId
        );
      }

      case 'mprTriad': {
        const canonicalIds = this._getCanonicalMprViewportIds();
        return candidates.filter((viewport) =>
          canonicalIds.includes(viewport.id)
        );
      }

      case 'selectedViewports': {
        return candidates
          .filter((viewport) =>
            selectedSourceViewportIds?.includes(viewport.id)
          )
          .slice(0, maxSourceViewports);
      }

      case 'allLinked': {
        return candidates
          .filter((viewport) => {
            const sourcePlane = getViewportPlane(viewport);
            if (!sourcePlane) {
              return false;
            }
            return (
              Math.abs(vec3.dot(sourcePlane.normal, targetPlane.normal)) <=
              SAME_ORIENTATION_TOLERANCE
            );
          })
          .slice(0, maxSourceViewports);
      }

      case 'debugAll': {
        // Debug/advanced: every spatially linked source, no cap. Never the
        // clinical default.
        return candidates;
      }

      default:
        return [];
    }
  }

  /**
   * Identifies the canonical axial, sagittal and coronal viewports in the
   * tool group (the first viewport found for each orientation). Duplicate /
   * follower viewports of the same orientation are not canonical.
   */
  protected _getCanonicalMprViewportIds(): string[] {
    const canonical: {
      axial?: string;
      sagittal?: string;
      coronal?: string;
    } = {};

    this._getToolGroupViewports().forEach((viewport) => {
      if (!this._isPlanarViewport(viewport)) {
        return;
      }

      const plane = getViewportPlane(viewport);
      if (!plane) {
        return;
      }

      const [x, y, z] = plane.normal.map(Math.abs);

      let orientation: 'axial' | 'sagittal' | 'coronal' | null = null;
      if (z > SAME_ORIENTATION_TOLERANCE) {
        orientation = 'axial';
      } else if (x > SAME_ORIENTATION_TOLERANCE) {
        orientation = 'sagittal';
      } else if (y > SAME_ORIENTATION_TOLERANCE) {
        orientation = 'coronal';
      }

      if (orientation && !canonical[orientation]) {
        canonical[orientation] = viewport.id;
      }
    });

    return Object.values(canonical).filter(Boolean) as string[];
  }

  // ===================================================================
  // Interactions
  // ===================================================================

  /**
   * The tool never creates real annotations from clicks in empty space:
   * clicking empty canvas never jumps and never stores a point. Under the
   * 'activeViewport' source policy, a click in a viewport makes it the
   * active source.
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): SliceIntersectionAnnotation => {
    const { element } = evt.detail;
    const enabledElement = getEnabledElement(element);

    if (!enabledElement) {
      return this._createDetachedAnnotation();
    }

    const { viewport } = enabledElement;

    if (
      this.configuration.sourcePolicy === 'activeViewport' &&
      this._isPlanarViewport(viewport)
    ) {
      this.setActiveSourceViewport(viewport.id);
    }

    return (
      this._getOrCreateViewportAnnotation(viewport) ??
      this._createDetachedAnnotation()
    );
  };

  isPointNearTool = (
    element: HTMLDivElement,
    _annotation: SliceIntersectionAnnotation,
    canvasCoords: Types.Point2,
    _proximity: number,
    _interactionType?: string
  ): boolean => {
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return false;
    }

    return !!this._findLineNear(
      enabledElement.viewport.id,
      canvasCoords,
      LINE_PROXIMITY
    );
  };

  getHandleNearImagePoint(
    element: HTMLDivElement,
    _annotation: Annotation,
    canvasCoords: Types.Point2,
    proximity: number
  ): ToolHandle | undefined {
    this._pendingHandle = null;

    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return undefined;
    }

    const lines = this._renderedLines.get(enabledElement.viewport.id) ?? [];

    for (const lineInfo of lines) {
      if (!lineInfo.controllable) {
        continue;
      }

      const nearRotate = lineInfo.rotateHandles.some(
        (handle) =>
          Math.hypot(
            handle[0] - canvasCoords[0],
            handle[1] - canvasCoords[1]
          ) <=
          this.configuration.handleRadius + proximity
      );
      if (nearRotate) {
        this._pendingHandle = { operation: 'rotate', lineInfo };
        return lineInfo.line.point as ToolHandle;
      }

      const nearSlab = lineInfo.slabHandles.some(
        (handle) =>
          Math.hypot(
            handle[0] - canvasCoords[0],
            handle[1] - canvasCoords[1]
          ) <=
          this.configuration.handleRadius + proximity
      );
      if (nearSlab) {
        this._pendingHandle = { operation: 'slabThickness', lineInfo };
        return lineInfo.line.point as ToolHandle;
      }
    }

    return undefined;
  }

  /**
   * Click on a line selects it; when dragging is enabled the drag translates
   * the source viewport slice plane along the source normal.
   */
  toolSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    _annotation: Annotation
  ): void => {
    const { element, currentPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return;
    }

    const lineInfo = this._findLineNear(
      enabledElement.viewport.id,
      currentPoints.canvas,
      LINE_PROXIMITY
    );
    if (!lineInfo) {
      return;
    }

    this._selectLine(lineInfo);

    if (this.configuration.draggable && lineInfo.controllable) {
      this._startManipulation(element, lineInfo, 'translate');
    }

    evt.preventDefault();
  };

  handleSelectedCallback = (
    evt: EventTypes.InteractionEventType,
    _annotation: Annotation,
    _handle: ToolHandle,
    _interactionType: InteractionTypes = 'Mouse'
  ): void => {
    const { element } = evt.detail;
    const pendingHandle = this._pendingHandle;
    this._pendingHandle = null;

    if (!pendingHandle) {
      return;
    }

    const { operation, lineInfo } = pendingHandle;

    if (operation === 'rotate' && !this.configuration.rotatable) {
      return;
    }
    if (
      operation === 'slabThickness' &&
      !this.configuration.slabThicknessControls
    ) {
      return;
    }

    this._selectLine(lineInfo);
    this._startManipulation(element, lineInfo, operation);
    evt.preventDefault();
  };

  /**
   * Optional double click behavior. Never mutates the WorldCrosshairTool
   * point unless setWorldCrosshairOnIntersectionDoubleClick is enabled.
   */
  doubleClickCallback = (evt: EventTypes.MouseDoubleClickEventType): void => {
    const {
      setWorldCrosshairOnIntersectionDoubleClick,
      jumpToIntersectionOnDoubleClick,
    } = this.configuration;

    if (
      !setWorldCrosshairOnIntersectionDoubleClick &&
      !jumpToIntersectionOnDoubleClick
    ) {
      return;
    }

    const { element, currentPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return;
    }

    const { viewport } = enabledElement;
    const lineInfo = this._findLineNear(
      viewport.id,
      currentPoints.canvas,
      LINE_PROXIMITY
    );
    if (!lineInfo) {
      return;
    }

    const pointOnLine = this._closestPointOnLine(
      lineInfo.line,
      currentPoints.world
    );

    if (jumpToIntersectionOnDoubleClick) {
      this._centerViewportOnPoint(viewport, pointOnLine);
    }

    if (setWorldCrosshairOnIntersectionDoubleClick) {
      // Optional, soft integration: looked up by tool name so this tool has
      // no dependency on the WorldCrosshairTool.
      const worldCrosshairInstance = getToolGroup(
        this.toolGroupId
      )?.getToolInstance?.('WorldCrosshair');

      worldCrosshairInstance?.setWorldPoint?.(pointOnLine, {
        sourceViewportId: viewport.id,
        sourceRenderingEngineId: enabledElement.renderingEngine?.id,
        frameOfReferenceUID: enabledElement.FrameOfReferenceUID,
      });
    }

    evt.preventDefault();
  };

  /**
   * Hover: highlights the intersection line under the cursor (and shows its
   * handles). Hovering never switches the active source viewport: that only
   * happens through clicks, scrolls or the public API, so lines stay
   * grabbable in the other viewports.
   */
  mouseMoveCallback = (
    evt: EventTypes.MouseMoveEventType,
    _filteredToolAnnotations?: Annotations
  ): boolean => {
    const { element, currentPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return false;
    }

    const { viewport } = enabledElement;
    if (!this._isPlanarViewport(viewport)) {
      return false;
    }

    const lineInfo = this._findLineNear(
      viewport.id,
      currentPoints.canvas,
      LINE_PROXIMITY
    );

    let needsRedraw = false;

    if (lineInfo) {
      if (
        this._activeSourceViewportId !== lineInfo.sourceViewportId ||
        this._activeTargetViewportId !== viewport.id
      ) {
        this._activeSourceViewportId = lineInfo.sourceViewportId;
        this._activeTargetViewportId = viewport.id;
        needsRedraw = true;
      }
      return needsRedraw;
    }

    if (this._activeTargetViewportId === viewport.id) {
      this._activeTargetViewportId = undefined;
      needsRedraw = true;
    }

    return needsRedraw;
  };

  filterInteractableAnnotationsForElement = (
    element: HTMLDivElement,
    annotations: Annotations
  ): Annotations => {
    if (!annotations?.length) {
      return [];
    }

    const enabledElement = getEnabledElement(element);
    if (!enabledElement) {
      return [];
    }

    const { viewportId } = enabledElement;
    return annotations.filter(
      (annotation) =>
        (annotation as SliceIntersectionAnnotation).data.viewportId ===
        viewportId
    );
  };

  cancel = (element: HTMLDivElement): void => {
    if (this._editData) {
      this._endManipulation(element, { suppressEvents: false });
    }
  };

  // ===================================================================
  // Manipulation (translate / rotate / slab thickness)
  // ===================================================================

  private _startManipulation(
    element: HTMLDivElement,
    lineInfo: RenderedIntersectionLine,
    operation: SliceIntersectionOperation
  ): void {
    const targetViewport = this._getViewportById(lineInfo.targetViewportId);

    this._editData = {
      targetViewportId: lineInfo.targetViewportId,
      sourceViewportId: lineInfo.sourceViewportId,
      operation,
    };

    if (operation === 'rotate' && targetViewport) {
      const targetPlane = getViewportPlane(targetViewport);
      this._editData.rotationAxis = targetPlane?.normal;
      this._editData.pivotWorld = this._resolveRotationPivot(
        targetViewport,
        lineInfo
      );
    }

    this._activeOperation = operation;
    state.isInteractingWithTool = true;
    hideElementCursor(element);

    const endCallback = this._endCallback as EventListener;
    const dragCallback = this._dragCallback as EventListener;

    element.addEventListener(Events.MOUSE_UP, endCallback);
    element.addEventListener(Events.MOUSE_DRAG, dragCallback);
    element.addEventListener(Events.MOUSE_CLICK, endCallback);

    element.addEventListener(Events.TOUCH_END, endCallback);
    element.addEventListener(Events.TOUCH_DRAG, dragCallback);
    element.addEventListener(Events.TOUCH_TAP, endCallback);

    triggerEvent(
      eventTarget,
      Events.SLICE_INTERSECTION_MANIPULATION_STARTED,
      this._getManipulationDetail(operation)
    );
  }

  private _endManipulation(
    element: HTMLDivElement,
    { suppressEvents = false } = {}
  ): void {
    const editData = this._editData;

    const endCallback = this._endCallback as EventListener;
    const dragCallback = this._dragCallback as EventListener;

    element.removeEventListener(Events.MOUSE_UP, endCallback);
    element.removeEventListener(Events.MOUSE_DRAG, dragCallback);
    element.removeEventListener(Events.MOUSE_CLICK, endCallback);

    element.removeEventListener(Events.TOUCH_END, endCallback);
    element.removeEventListener(Events.TOUCH_DRAG, dragCallback);
    element.removeEventListener(Events.TOUCH_TAP, endCallback);

    state.isInteractingWithTool = false;
    resetElementCursor(element);

    this._editData = null;
    this._activeOperation = null;

    if (editData && !suppressEvents) {
      triggerEvent(
        eventTarget,
        Events.SLICE_INTERSECTION_MANIPULATION_ENDED,
        this._getManipulationDetail(editData.operation, editData)
      );
    }

    this._renderToolViewports();
  }

  _endCallback = (evt: EventTypes.InteractionEventType): void => {
    const { element } = evt.detail;
    this._endManipulation(element);
  };

  _dragCallback = (evt: EventTypes.InteractionEventType): void => {
    const editData = this._editData;
    if (!editData) {
      return;
    }

    const sourceViewport = this._getViewportById(editData.sourceViewportId);
    if (!sourceViewport) {
      return;
    }

    switch (editData.operation) {
      case 'translate':
        this._applyTranslate(sourceViewport, evt);
        break;
      case 'rotate':
        this._applyRotate(sourceViewport, evt, editData);
        break;
      case 'slabThickness':
        this._applySlabThickness(sourceViewport, evt);
        break;
    }

    this._renderToolViewports();
  };

  /**
   * Dragging a line translates only the source viewport slice plane along the
   * source viewport normal (the drag delta projected onto that normal).
   */
  private _applyTranslate(
    sourceViewport: Types.IViewport,
    evt: EventTypes.InteractionEventType
  ): void {
    const deltaWorld = evt.detail.deltaPoints?.world;
    if (!deltaWorld) {
      return;
    }

    const sourcePlane = getViewportPlane(sourceViewport);
    if (!sourcePlane) {
      return;
    }

    const scrollDistance = vec3.dot(deltaWorld, sourcePlane.normal);
    if (translateViewportAlongNormal(sourceViewport, scrollDistance)) {
      sourceViewport.render();
    }
  }

  /**
   * Dragging a rotation handle rotates only the source viewport slice plane
   * around the resolved pivot, about the target viewport view-plane normal.
   *
   * The rotation is expressed through the native view reference API: the
   * rotated orientation vectors and the pivot are written with
   * `setViewReference`, which reorients volume-backed planar viewports.
   * Image-stack sources cannot be reoriented and are skipped.
   */
  private _applyRotate(
    sourceViewport: Types.IViewport,
    evt: EventTypes.InteractionEventType,
    editData: EditData
  ): void {
    const { pivotWorld, rotationAxis, targetViewportId } = editData;
    if (!pivotWorld || !rotationAxis) {
      return;
    }

    if (!this._isVolumeModeViewport(sourceViewport)) {
      return;
    }

    const targetViewport = this._getViewportById(targetViewportId);
    if (!targetViewport) {
      return;
    }

    const eventDetail = evt.detail;
    const currentCanvas = eventDetail.currentPoints?.canvas;
    const deltaCanvas = eventDetail.deltaPoints?.canvas;
    if (!currentCanvas || !deltaCanvas) {
      return;
    }

    const pivotCanvas = targetViewport.worldToCanvas(pivotWorld);
    const previousCanvas: Types.Point2 = [
      currentCanvas[0] - deltaCanvas[0],
      currentCanvas[1] - deltaCanvas[1],
    ];

    const dir1 = vec2.subtract(vec2.create(), previousCanvas, pivotCanvas);
    const dir2 = vec2.subtract(vec2.create(), currentCanvas, pivotCanvas);

    if (vec2.length(dir1) < 1e-6 || vec2.length(dir2) < 1e-6) {
      return;
    }

    let angle = vec2.angle(dir1, dir2);
    if (!Number.isFinite(angle) || angle === 0) {
      return;
    }

    const cross =
      dir1[0] * dir2[1] -
      dir1[1] * dir2[0];
    if (cross > 0) {
      angle *= -1;
    }

    // Round so a rotation can be undone by rotating back by the same amount.
    angle = Math.round(angle * 100) / 100;
    if (angle === 0) {
      return;
    }

    const { viewPlaneNormal, viewUp } = getViewportICamera(sourceViewport);
    if (!viewPlaneNormal || !viewUp) {
      return;
    }

    const normalizedAxis = vec3.normalize(vec3.create(), rotationAxis);
    if (vec3.length(normalizedAxis) < 1e-10) {
      return;
    }

    const rotation = mat4.fromRotation(mat4.create(), angle, normalizedAxis);
    if (!rotation) {
      return;
    }

    const newViewPlaneNormal = vec3.transformMat4(
      vec3.create(),
      viewPlaneNormal,
      rotation
    );
    const newViewUp = vec3.transformMat4(vec3.create(), viewUp, rotation);

    (sourceViewport as Types.IGenericViewport).setViewReference({
      viewPlaneNormal: [
        newViewPlaneNormal[0],
        newViewPlaneNormal[1],
        newViewPlaneNormal[2],
      ],
      viewUp: [newViewUp[0], newViewUp[1], newViewUp[2]],
      cameraFocalPoint: [pivotWorld[0], pivotWorld[1], pivotWorld[2]],
    } as Types.ViewReference);
    sourceViewport.render();
  }

  /**
   * Dragging a slab handle changes only the source viewport slab thickness:
   * twice the distance of the cursor from the source slice plane.
   */
  private _applySlabThickness(
    sourceViewport: Types.IViewport,
    evt: EventTypes.InteractionEventType
  ): void {
    const currentWorld = evt.detail.currentPoints?.world;
    if (!currentWorld) {
      return;
    }

    const sourcePlane = getViewportPlane(sourceViewport);
    if (!sourcePlane) {
      return;
    }

    const slabThickness = Math.max(
      RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
      Math.abs(distancePointToPlane(currentWorld, sourcePlane)) * 2
    );

    this._setSourceViewportSlabThickness(sourceViewport, slabThickness);
  }

  /**
   * Reads and writes slab thickness exclusively through the source viewport
   * display-set presentation (the native next API); the tool itself stores
   * no slab state. Only volume-backed planar sources have a slab.
   */
  private _setSourceViewportSlabThickness(
    sourceViewport: Types.IViewport,
    slabThickness: number
  ): void {
    if (!this._isVolumeModeViewport(sourceViewport)) {
      return;
    }

    const dataId = this._getSourceDataId(sourceViewport);
    if (!dataId) {
      return;
    }

    const currentSlabThickness = this._getSourceSlabThickness(sourceViewport);
    if (Math.abs(currentSlabThickness - slabThickness) < 1e-6) {
      return;
    }

    let blendMode = this.configuration.slabThicknessBlendMode;
    if (slabThickness <= RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS) {
      blendMode = Enums.BlendModes.COMPOSITE;
    }

    (sourceViewport as Types.IGenericViewport).setDisplaySetPresentation(
      dataId,
      {
        slabThickness,
        blendMode,
      }
    );
    sourceViewport.render();

    triggerEvent(
      eventTarget,
      Events.SLICE_INTERSECTION_SLAB_THICKNESS_CHANGED,
      this._getManipulationDetail('slabThickness')
    );
  }

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

  /**
   * True when the planar viewport currently displays volume-backed slice
   * content (as opposed to an image stack), which is required for slab
   * thickness and plane rotation.
   */
  private _isVolumeModeViewport(viewport: Types.IViewport): boolean {
    if (!this._isPlanarViewport(viewport)) {
      return false;
    }

    try {
      return viewport.getCurrentMode?.() === 'volume';
    } catch {
      return false;
    }
  }

  private _getSourceDataId(viewport: Types.IViewport): string | undefined {
    if (!csUtils.viewportSupportsDisplaySetPresentation(viewport)) {
      return undefined;
    }
    return viewport.getSourceDataId();
  }

  /**
   * Reads the source viewport slab thickness from its display-set
   * presentation; defaults to the minimum slab thickness.
   */
  private _getSourceSlabThickness(viewport: Types.IViewport): number {
    const dataId = this._getSourceDataId(viewport);
    if (!dataId) {
      return RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
    }

    const presentation = (
      viewport as Types.IGenericViewport
    ).getDisplaySetPresentation(dataId) as
      | { slabThickness?: number }
      | undefined;
    const slabThickness = presentation?.slabThickness;

    return Number.isFinite(slabThickness) && slabThickness > 0
      ? slabThickness
      : RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS;
  }

  private _resolveRotationPivot(
    targetViewport: Types.IViewport,
    lineInfo: RenderedIntersectionLine
  ): Types.Point3 {
    const { rotationPivotPolicy } = this.configuration;

    if (rotationPivotPolicy === 'worldCrosshairPointIfAvailable') {
      // Optional, soft lookup by tool name: SliceIntersectionTool must not
      // require the WorldCrosshairTool. Falls back to currentIntersection.
      const worldCrosshairInstance = getToolGroup(
        this.toolGroupId
      )?.getToolInstance?.('WorldCrosshair');
      const worldPoint = worldCrosshairInstance?.getWorldPoint?.();
      if (worldPoint) {
        return worldPoint;
      }
    }

    if (rotationPivotPolicy === 'viewportCenter') {
      const { focalPoint } = getViewportICamera(targetViewport);
      if (focalPoint) {
        return focalPoint;
      }
    }

    // 'currentIntersection' (and fallback): the point on the intersection
    // line nearest the target viewport center.
    const { focalPoint } = getViewportICamera(targetViewport);
    return this._closestPointOnLine(
      lineInfo.line,
      focalPoint ?? lineInfo.line.point
    );
  }

  private _closestPointOnLine(
    line: WorldLine,
    point: Types.Point3
  ): Types.Point3 {
    const toPoint = vec3.subtract(vec3.create(), point, line.point);
    const projection = vec3.dot(toPoint, line.direction);

    return [
      line.point[0] + line.direction[0] * projection,
      line.point[1] + line.direction[1] * projection,
      line.point[2] + line.direction[2] * projection,
    ];
  }

  private _centerViewportOnPoint(
    viewport: Types.IViewport,
    worldPoint: Types.Point3
  ): void {
    if (!this._isPlanarViewport(viewport)) {
      return;
    }

    // Pin the point to the canvas center fraction through the native view
    // state; the slice and zoom are untouched.
    viewport.setViewState({
      anchorWorld: [worldPoint[0], worldPoint[1], worldPoint[2]],
      anchorCanvas: [0.5, 0.5],
    });
    viewport.render();
  }

  // ===================================================================
  // Helpers
  // ===================================================================

  private _selectLine(lineInfo: RenderedIntersectionLine): void {
    this._activeSourceViewportId = lineInfo.sourceViewportId;
    this._activeTargetViewportId = lineInfo.targetViewportId;

    triggerEvent(eventTarget, Events.SLICE_INTERSECTION_LINE_SELECTED, {
      toolGroupId: this.toolGroupId,
      sourceViewportId: lineInfo.sourceViewportId,
      targetViewportId: lineInfo.targetViewportId,
    } as SliceIntersectionLineSelectedEventDetail);
  }

  private _findLineNear(
    viewportId: string,
    canvasCoords: Types.Point2,
    proximity: number
  ): RenderedIntersectionLine | null {
    const lines = this._renderedLines.get(viewportId) ?? [];

    for (const lineInfo of lines) {
      const distance = lineSegment.distanceToPoint(
        lineInfo.canvasPoints[0],
        lineInfo.canvasPoints[1],
        canvasCoords
      );

      if (distance <= proximity) {
        return lineInfo;
      }
    }

    return null;
  }

  protected _getViewportsInfo(): Types.IViewportId[] {
    return getToolGroup(this.toolGroupId)?.viewportsInfo ?? [];
  }

  protected _getToolGroupViewports(): Types.IViewport[] {
    return this._getViewportsInfo()
      .map(
        ({ viewportId, renderingEngineId }) =>
          getEnabledElementByIds(viewportId, renderingEngineId)?.viewport
      )
      .filter(Boolean);
  }

  private _getViewportById(
    viewportId: string | undefined
  ): Types.IViewport | undefined {
    if (!viewportId) {
      return undefined;
    }
    return this._getToolGroupViewports().find(
      (viewport) => viewport.id === viewportId
    );
  }

  private _renderToolViewports(): void {
    const viewportIds = this._getViewportsInfo().map(
      ({ viewportId }) => viewportId
    );
    if (viewportIds.length) {
      triggerAnnotationRenderForViewportIds(viewportIds);
    }
  }

  private _initDefaultActiveSourceViewport(): void {
    if (
      this.configuration.sourcePolicy !== 'activeViewport' ||
      this._activeSourceViewportId
    ) {
      return;
    }

    const [firstViewport] = this._getToolGroupViewports().filter((viewport) =>
      this._isPlanarViewport(viewport)
    );
    if (firstViewport) {
      this._activeSourceViewportId = firstViewport.id;
    }
  }

  /**
   * Per-viewport annotations exist only so the standard interaction pipeline
   * (hover / mouse down hit-testing) engages this tool; they carry no
   * geometry. All line geometry is recomputed from cameras on every render.
   */
  private _getOrCreateViewportAnnotation(
    viewport: Types.IViewport
  ): SliceIntersectionAnnotation | null {
    const { element } = viewport;
    if (!element) {
      return null;
    }

    const annotations = getAnnotations(this.getToolName(), element);
    const existing = annotations?.find(
      (annotation) =>
        (annotation as SliceIntersectionAnnotation).data.viewportId ===
        viewport.id
    );
    if (existing) {
      return existing as SliceIntersectionAnnotation;
    }

    const annotation: SliceIntersectionAnnotation = {
      highlighted: false,
      invalidated: false,
      metadata: {
        toolName: this.getToolName(),
        FrameOfReferenceUID: viewport.getFrameOfReferenceUID?.(),
      },
      data: {
        viewportId: viewport.id,
        handles: { points: [] },
      },
    } as SliceIntersectionAnnotation;

    addAnnotation(annotation, element);
    return annotation;
  }

  private _createDetachedAnnotation(): SliceIntersectionAnnotation {
    return {
      annotationUID: csUtils.uuidv4() as string,
      highlighted: false,
      invalidated: false,
      metadata: {
        toolName: this.getToolName(),
      },
      data: {
        viewportId: '',
        handles: { points: [] },
      },
    } as SliceIntersectionAnnotation;
  }

  private _emitSourceChanged(): void {
    triggerEvent(eventTarget, Events.SLICE_INTERSECTION_SOURCE_CHANGED, {
      toolGroupId: this.toolGroupId,
      sourcePolicy: this.configuration.sourcePolicy,
      activeSourceViewportId: this._activeSourceViewportId,
      selectedSourceViewportIds: [
        ...(this.configuration.selectedSourceViewportIds ?? []),
      ],
    } as SliceIntersectionSourceChangedEventDetail);
  }

  private _getManipulationDetail(
    operation: SliceIntersectionOperation,
    editData: EditData | null = this._editData
  ): SliceIntersectionManipulationEventDetail {
    return {
      toolGroupId: this.toolGroupId,
      sourceViewportId:
        editData?.sourceViewportId ?? this._activeSourceViewportId ?? '',
      targetViewportId:
        editData?.targetViewportId ?? this._activeTargetViewportId ?? '',
      operation,
    };
  }
}

SliceIntersectionTool.toolName = 'SliceIntersection';
export default SliceIntersectionTool;
