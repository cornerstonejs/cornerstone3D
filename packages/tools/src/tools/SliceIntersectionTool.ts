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
import { navigatePlanarViewportToPoint } from '../utilities/genericViewportToolHelpers';
import * as lineSegment from '../utilities/math/line';
import {
  getViewportPlane,
  intersectPlanes,
  distancePointToPlane,
  clipWorldLineToViewportCanvas,
  translateViewportAlongNormal,
} from '../utilities/spatial';
import type { Plane, WorldLine } from '../utilities/spatial';
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

/** Canvas proximity (px) used for line hover/hit testing. */
const LINE_PROXIMITY = 6;

/** Minimum canvas offset (px) for slab handles when the slab is collapsed. */
const MIN_SLAB_HANDLE_CANVAS_OFFSET = 12;

/**
 * Where along the clipped line the slab handles anchor (0 = start, 1 = end).
 * Near one end so handles of crossing lines never overlap at the shared
 * intersection point.
 */
const SLAB_HANDLE_LINE_FRACTION = 0.85;

/** Safety cap for intermediate slice lines, to avoid line spam. */
const MAX_INTERMEDIATE_LINES = 50;

export type MprPlaneFamily = 'axial' | 'sagittal' | 'coronal';

export type SliceIntersectionOperation =
  | 'translate'
  | 'rotate'
  | 'slabThickness';

/**
 * A group of viewports that display the same plane family over the same
 * frame of reference (e.g. the CT axial slice, the PT axial slice and a 2D
 * axial acquisition stack together form the "axial" plane group). The group
 * is what clinicians think of as "the axial plane": it renders as ONE line
 * in the other viewports, and manipulating that line moves every member.
 */
export type SliceIntersectionPlaneGroup = {
  /** Stable id: `${frameOfReferenceUID}:${family}`. */
  id: string;
  family: MprPlaneFamily;
  frameOfReferenceUID: string;
  /** All member viewport ids (volume slices and image stacks). */
  viewportIds: string[];
  /**
   * The member whose plane defines the group's rendered line: the first
   * volume-backed member (rotatable, has a slab), else the first member.
   */
  leaderViewportId: string;
};

export type SliceIntersectionState = {
  toolGroupId: string;
  activeGroupId?: string;
  activeTargetViewportId?: string;
  activeOperation?: SliceIntersectionOperation | null;
};

export type SliceIntersectionRotationPivotPolicy =
  | 'currentIntersection'
  | 'viewportCenter'
  | 'worldCrosshairPointIfAvailable';

export type SliceIntersectionToolConfiguration = {
  /** Draw the center intersection line of each plane group. */
  showCurrentSliceLine: boolean;
  /** Draw dashed slab boundary lines when the group's slab is > minimum. */
  showSlabThickness: boolean;
  /** Draw the first/last slice boundary lines of the group volume. */
  showBoundaryLines: boolean;
  /** Draw intermediate slice lines between the boundaries (capped). */
  showIntermediateLines: boolean;

  /** Dragging a line translates every member of its plane group. */
  draggable: boolean;
  /** Rotation handles reorient the volume-backed members of the group. */
  rotatable: boolean;
  /** Slab handles adjust the slab of the volume-backed members. */
  slabThicknessControls: boolean;

  lineWidth: number;
  activeLineWidth: number;
  handleRadius: number;

  /**
   * On enable, snap every member of a plane group to the group leader's
   * plane so the single rendered line is true for all members, and keep
   * them moving together afterwards.
   */
  alignGroupsOnEnable: boolean;

  rotationPivotPolicy: SliceIntersectionRotationPivotPolicy;

  /** One color per plane family; stable regardless of oblique rotation. */
  familyColors: Record<MprPlaneFamily, string>;
  /** Optional color override per group line. */
  getLineColor?: (
    family: MprPlaneFamily,
    groupId: string,
    targetViewportId: string
  ) => string;

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

  /**
   * Debug/advanced: draw one line per individual viewport instead of one
   * line per plane group (and manipulate only that viewport). Never the
   * clinical default.
   */
  perViewportLines: boolean;
};

export type SliceIntersectionManipulationEventDetail = {
  toolGroupId: string;
  /** The manipulated plane group. */
  groupId: string;
  family?: MprPlaneFamily;
  /** All viewports moved by the manipulation. */
  viewportIds: string[];
  targetViewportId: string;
  operation: SliceIntersectionOperation;
};

export type SliceIntersectionLineSelectedEventDetail = {
  toolGroupId: string;
  groupId: string;
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
 * One plane-group line rendered into a target viewport, cached per render
 * pass for hit testing. All geometry is derived from the actual camera
 * planes: it is recomputed on every render and never persisted.
 */
export type RenderedIntersectionLine = {
  groupId: string;
  family: MprPlaneFamily;
  leaderViewportId: string;
  memberViewportIds: string[];
  targetViewportId: string;
  /** The world-space plane-plane intersection line. */
  line: WorldLine;
  /** The group leader's slice plane the line was computed from. */
  leaderPlane: Plane;
  /** Center line clipped to the target canvas. */
  canvasPoints: [Types.Point2, Types.Point2];
  /** Slab boundary segments (present when slab thickness rendering is on). */
  slabLineSegments: Array<[Types.Point2, Types.Point2]>;
  /** Rotation handle canvas positions (only for the active line). */
  rotateHandles: Types.Point2[];
  /** Slab thickness handle canvas positions (only for the active line). */
  slabHandles: Types.Point2[];
  color: string;
  isActive: boolean;
};

type PendingHandle = {
  operation: 'rotate' | 'slabThickness';
  lineInfo: RenderedIntersectionLine;
};

type EditData = {
  targetViewportId: string;
  groupId: string;
  family?: MprPlaneFamily;
  memberViewportIds: string[];
  operation: SliceIntersectionOperation;
  pivotWorld?: Types.Point3;
  rotationAxis?: Types.Point3;
  /**
   * Each member's plane point at drag start. Translation targets are
   * computed as `start + total drag delta` (absolute), never by integrating
   * per-tick deltas from the member's current (grid-snapped) position -
   * per-tick integration silently loses any motion smaller than half a
   * member's slice spacing.
   */
  memberStartPlanePoints?: Map<string, Types.Point3>;
  /**
   * Each member's presentation scale at drag start, re-asserted after every
   * orientation write so fit-based scaling does not pulse the zoom while
   * rotating.
   */
  memberStartScales?: Map<string, unknown>;
};

/**
 * SliceIntersectionTool ("Slice Intersections") renders and manipulates
 * slice plane intersection lines on Generic (PLANAR_NEXT) viewports.
 *
 * The tool thinks in PLANES, not viewports: viewports showing the same plane
 * family over the same frame of reference (e.g. CT axial + PT axial + a 2D
 * axial stack) form one plane group. Each viewport shows exactly one line
 * per OTHER plane group - never duplicate near-identical lines - and:
 *
 * - dragging a line translates every member of that group (each along its
 *   own normal; stacks snap to their closest image),
 * - rotation handles reorient the volume-backed members together (stacks
 *   cannot reorient and keep following translations only),
 * - slab handles adjust the slab of the volume-backed members.
 *
 * Every rendered line is the true plane-plane intersection of the target
 * viewport plane and the group leader plane. The tool stores no persistent
 * world point, has no shared "center", and does not render in 3D viewports.
 */
class SliceIntersectionTool extends AnnotationTool {
  static toolName;
  /** User-facing label for this tool. */
  static toolLabel = 'Slice Intersections';

  private _activeGroupId?: string;
  private _activeTargetViewportId?: string;
  private _activeOperation: SliceIntersectionOperation | null = null;

  /** Rendered line cache per target viewport id, refreshed on every render. */
  private _renderedLines = new Map<string, RenderedIntersectionLine[]>();
  private _pendingHandle: PendingHandle | null = null;
  private _editData: EditData | null = null;
  /**
   * Sticky per-viewport MPR family (axial/sagittal/coronal), assigned from
   * the plane's dominant axis the first time a viewport is classified. Kept
   * stable afterwards so rotating a plane past 45 degrees never reassigns
   * families mid-drag (which would swap groups and colors).
   */
  private _mprFamilyByViewportId = new Map<string, MprPlaneFamily>();

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        showCurrentSliceLine: true,
        showSlabThickness: true,
        showBoundaryLines: false,
        showIntermediateLines: false,

        draggable: true,
        rotatable: true,
        slabThicknessControls: true,

        lineWidth: 1,
        activeLineWidth: 2.5,
        handleRadius: 3,

        alignGroupsOnEnable: true,

        rotationPivotPolicy: 'currentIntersection',

        familyColors: {
          axial: 'rgb(200, 60, 60)',
          sagittal: 'rgb(220, 200, 60)',
          coronal: 'rgb(60, 200, 60)',
        },

        setWorldCrosshairOnIntersectionDoubleClick: false,
        jumpToIntersectionOnDoubleClick: false,

        slabThicknessBlendMode: Enums.BlendModes.MAXIMUM_INTENSITY_BLEND,

        perViewportLines: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  // ===================================================================
  // Public API
  // ===================================================================

  /**
   * Returns a copy of the tool state.
   */
  public getState(): SliceIntersectionState {
    return {
      toolGroupId: this.toolGroupId,
      activeGroupId: this._activeGroupId,
      activeTargetViewportId: this._activeTargetViewportId,
      activeOperation: this._activeOperation,
    };
  }

  /**
   * Returns the current plane groups (copies).
   */
  public getPlaneGroups(): SliceIntersectionPlaneGroup[] {
    return this._getPlaneGroups().map((group) => ({
      ...group,
      viewportIds: [...group.viewportIds],
    }));
  }

  /**
   * Clears the sticky family classification so viewports are re-classified
   * from their current plane normals (e.g. after programmatically
   * re-orienting a viewport to a different plane family).
   */
  public refreshPlaneFamilies(): void {
    this._mprFamilyByViewportId.clear();
    this._renderToolViewports();
  }

  // ===================================================================
  // Tool lifecycle
  // ===================================================================

  onSetToolEnabled(): void {
    if (this.configuration.alignGroupsOnEnable) {
      this._alignPlaneGroups();
    }
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
    this._activeGroupId = undefined;
    this._activeTargetViewportId = undefined;
    state.isInteractingWithTool = false;
    this._renderedLines.clear();
    this._mprFamilyByViewportId.clear();

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
   * Lines are pure derivations of the camera planes, so a camera change just
   * needs an annotation re-render. To keep slice scrolling responsive, the
   * re-render is targeted: only viewports that display a line whose group
   * leader is the modified viewport (plus the modified viewport itself) are
   * refreshed.
   */
  onCameraModified = (evt: Types.EventTypes.CameraModifiedEvent): void => {
    const viewportId = evt.detail?.viewportId;

    if (!viewportId) {
      this._renderToolViewports();
      return;
    }

    const viewportIdsToRender = new Set<string>();

    for (const [targetViewportId, lines] of this._renderedLines) {
      if (targetViewportId === viewportId) {
        // The modified viewport's own plane moved: the lines it displays
        // (from other groups) need re-clipping.
        if (lines.length) {
          viewportIdsToRender.add(targetViewportId);
        }
        continue;
      }

      if (lines.some((line) => line.leaderViewportId === viewportId)) {
        viewportIdsToRender.add(targetViewportId);
      }
    }

    if (viewportIdsToRender.size) {
      triggerAnnotationRenderForViewportIds([...viewportIdsToRender]);
    }
  };

  // ===================================================================
  // Plane groups
  // ===================================================================

  /**
   * Returns the sticky MPR family of a planar viewport, classifying it from
   * the dominant axis of its plane normal on first sight. The assignment is
   * kept for the lifetime of the tool (until disabled or explicitly
   * refreshed), so rotating a plane past 45 degrees never moves the viewport
   * to a different family.
   */
  protected _getMprFamily(viewport: Types.IViewport): MprPlaneFamily | null {
    const cached = this._mprFamilyByViewportId.get(viewport.id);
    if (cached) {
      return cached;
    }

    const plane = getViewportPlane(viewport);
    if (!plane) {
      return null;
    }

    const [x, y, z] = plane.normal.map(Math.abs);
    const family = z >= x && z >= y ? 'axial' : x >= y ? 'sagittal' : 'coronal';

    this._mprFamilyByViewportId.set(viewport.id, family);
    return family;
  }

  /**
   * Groups the tool-group planar viewports by (frame of reference, sticky
   * plane family). In the debug `perViewportLines` mode every viewport is
   * its own group.
   */
  protected _getPlaneGroups(): SliceIntersectionPlaneGroup[] {
    const planarViewports = this._getToolGroupViewports().filter((viewport) =>
      this._isPlanarViewport(viewport)
    );

    if (this.configuration.perViewportLines) {
      return planarViewports
        .map((viewport) => {
          const family = this._getMprFamily(viewport);
          const frameOfReferenceUID = viewport.getFrameOfReferenceUID?.();
          if (!family || !frameOfReferenceUID) {
            return null;
          }
          return {
            id: viewport.id,
            family,
            frameOfReferenceUID,
            viewportIds: [viewport.id],
            leaderViewportId: viewport.id,
          };
        })
        .filter(Boolean) as SliceIntersectionPlaneGroup[];
    }

    const groups = new Map<string, SliceIntersectionPlaneGroup>();

    planarViewports.forEach((viewport) => {
      const family = this._getMprFamily(viewport);
      const frameOfReferenceUID = viewport.getFrameOfReferenceUID?.();
      if (!family || !frameOfReferenceUID) {
        return;
      }

      const id = `${frameOfReferenceUID}:${family}`;
      let group = groups.get(id);
      if (!group) {
        group = {
          id,
          family,
          frameOfReferenceUID,
          viewportIds: [],
          leaderViewportId: viewport.id,
        };
        groups.set(id, group);
      }

      group.viewportIds.push(viewport.id);

      // The leader is the first volume-backed member (its plane can rotate
      // and has a slab); a stack only leads when no volume member exists.
      const currentLeader = this._getViewportById(group.leaderViewportId);
      if (
        !this._isVolumeModeViewport(currentLeader) &&
        this._isVolumeModeViewport(viewport)
      ) {
        group.leaderViewportId = viewport.id;
      }
    });

    return [...groups.values()];
  }

  /**
   * Snaps every member of each plane group to its group leader's plane
   * (each member translating along its own normal only), so the single
   * rendered line is true for all members and the group moves as one from
   * then on.
   */
  protected _alignPlaneGroups(): void {
    const previousInteracting = state.isInteractingWithTool;
    state.isInteractingWithTool = true;

    try {
      this._getPlaneGroups().forEach((group) => {
        if (group.viewportIds.length < 2) {
          return;
        }

        const leader = this._getViewportById(group.leaderViewportId);
        const leaderPlane = leader && getViewportPlane(leader);
        if (!leaderPlane) {
          return;
        }

        group.viewportIds.forEach((viewportId) => {
          if (viewportId === group.leaderViewportId) {
            return;
          }

          const member = this._getViewportById(viewportId);
          if (!member || !this._isPlanarViewport(member)) {
            return;
          }

          if (navigatePlanarViewportToPoint(member, leaderPlane.point)) {
            member.render();
          }
        });
      });
    } finally {
      state.isInteractingWithTool = previousInteracting;
    }
  }

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
      annotation?.annotationUID ?? `SliceIntersection-${targetViewport.id}`;

    const { lineWidth, activeLineWidth, handleRadius, showCurrentSliceLine } =
      this.configuration;

    lines.forEach((lineInfo) => {
      const { groupId, canvasPoints, color, isActive } = lineInfo;
      const width = isActive ? activeLineWidth : lineWidth;

      if (showCurrentSliceLine) {
        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          `line-${groupId}`,
          canvasPoints[0],
          canvasPoints[1],
          {
            color,
            width,
          },
          `${annotationUID}-line-${groupId}`
        );
      }

      lineInfo.slabLineSegments.forEach((segment, index) => {
        drawLineSvg(
          svgDrawingHelper,
          annotationUID,
          `slab-${groupId}-${index}`,
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
          `rotate-handle-${groupId}-${index}`,
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
          `slab-handle-${groupId}-${index}`,
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
   * Computes the plane-group lines to render into a target viewport. Pure
   * geometry: every line is the actual plane-plane intersection of the
   * target plane and the group leader plane.
   */
  protected _computeLinesForTarget(
    targetViewport: Types.IViewport
  ): RenderedIntersectionLine[] {
    if (!targetViewport || !this._isPlanarViewport(targetViewport)) {
      // Native-next planar only: legacy viewports and 3D viewports never
      // render intersection lines.
      return [];
    }

    const targetPlane = getViewportPlane(targetViewport);
    if (!targetPlane) {
      return [];
    }

    const targetFrameOfReferenceUID = targetViewport.getFrameOfReferenceUID?.();
    if (!targetFrameOfReferenceUID) {
      return [];
    }

    const lines: RenderedIntersectionLine[] = [];

    this._getPlaneGroups().forEach((group) => {
      // Only groups of the same frame of reference are spatially meaningful,
      // and a viewport never displays its own group's line.
      if (
        group.frameOfReferenceUID !== targetFrameOfReferenceUID ||
        group.viewportIds.includes(targetViewport.id)
      ) {
        return;
      }

      const lineInfo = this._computeLineForGroup(
        targetViewport,
        targetPlane,
        group
      );
      if (lineInfo) {
        lines.push(lineInfo);
      }
    });

    return lines;
  }

  private _computeLineForGroup(
    targetViewport: Types.IViewport,
    targetPlane: Plane,
    group: SliceIntersectionPlaneGroup
  ): RenderedIntersectionLine | null {
    const leaderViewport = this._getViewportById(group.leaderViewportId);
    if (!leaderViewport) {
      return null;
    }

    const leaderPlane = getViewportPlane(leaderViewport);
    if (!leaderPlane) {
      return null;
    }

    const line = intersectPlanes(targetPlane, leaderPlane);
    if (!line) {
      // Parallel planes (e.g. two different families rotated onto each
      // other) have no intersection line to draw.
      return null;
    }

    const canvasPoints = clipWorldLineToViewportCanvas(line, targetViewport);
    if (!canvasPoints) {
      return null;
    }

    const { familyColors, getLineColor } = this.configuration;
    const color =
      getLineColor?.(group.family, group.id, targetViewport.id) ??
      familyColors?.[group.family] ??
      'rgb(0, 200, 200)';

    const isActive =
      this._activeGroupId === group.id &&
      this._activeTargetViewportId === targetViewport.id;

    const lineInfo: RenderedIntersectionLine = {
      groupId: group.id,
      family: group.family,
      leaderViewportId: group.leaderViewportId,
      memberViewportIds: [...group.viewportIds],
      targetViewportId: targetViewport.id,
      line,
      leaderPlane,
      canvasPoints,
      slabLineSegments: [],
      rotateHandles: [],
      slabHandles: [],
      color,
      isActive,
    };

    this._appendSlabGeometry(
      lineInfo,
      targetViewport,
      targetPlane,
      leaderViewport,
      leaderPlane
    );
    this._appendBoundaryGeometry(
      lineInfo,
      targetViewport,
      targetPlane,
      leaderViewport,
      leaderPlane
    );

    if (isActive) {
      this._appendHandles(lineInfo, targetViewport, leaderViewport);
    }

    return lineInfo;
  }

  /**
   * Intersects a plane parallel to the leader plane (offset along its
   * normal) with the target plane and clips it to the target canvas.
   */
  private _clipOffsetPlaneIntersection(
    targetViewport: Types.IViewport,
    targetPlane: Plane,
    leaderPlane: Plane,
    offset: number
  ): [Types.Point2, Types.Point2] | null {
    const offsetPlane: Plane = {
      normal: leaderPlane.normal,
      point: [
        leaderPlane.point[0] + leaderPlane.normal[0] * offset,
        leaderPlane.point[1] + leaderPlane.normal[1] * offset,
        leaderPlane.point[2] + leaderPlane.normal[2] * offset,
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
   * relative to the leader slice plane. The slab thickness itself is read
   * from the viewport display-set presentation and never stored on this
   * tool.
   */
  private _appendSlabGeometry(
    lineInfo: RenderedIntersectionLine,
    targetViewport: Types.IViewport,
    targetPlane: Plane,
    leaderViewport: Types.IViewport,
    leaderPlane: Plane
  ): void {
    if (
      !this.configuration.showSlabThickness ||
      !this._isVolumeModeViewport(leaderViewport)
    ) {
      return;
    }

    const slabThickness = this._getSourceSlabThickness(leaderViewport);
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
        leaderPlane,
        offset
      );
      if (segment) {
        lineInfo.slabLineSegments.push(segment);
      }
    });
  }

  /**
   * Optional boundary/intermediate slice lines derived from the leader
   * viewport image bounds along the leader normal.
   */
  private _appendBoundaryGeometry(
    lineInfo: RenderedIntersectionLine,
    targetViewport: Types.IViewport,
    targetPlane: Plane,
    leaderViewport: Types.IViewport,
    leaderPlane: Plane
  ): void {
    const { showBoundaryLines, showIntermediateLines } = this.configuration;
    if (!showBoundaryLines && !showIntermediateLines) {
      return;
    }

    const extent = this._getSourceExtentAlongNormal(
      leaderViewport,
      leaderPlane
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
        leaderPlane,
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
      imageData = (sourceViewport as Types.IVolumeViewport).getImageData?.();
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
    leaderViewport: Types.IViewport
  ): void {
    const { rotatable, slabThicknessControls, showSlabThickness } =
      this.configuration;
    const [start, end] = lineInfo.canvasPoints;

    // Rotation and slab manipulation require a volume-backed leader: image
    // stack planes cannot be reoriented and have no slab.
    const volumeMode = this._isVolumeModeViewport(leaderViewport);

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
        leaderViewport
      );
    }
  }

  private _computeSlabHandles(
    lineInfo: RenderedIntersectionLine,
    targetViewport: Types.IViewport,
    leaderViewport: Types.IViewport
  ): Types.Point2[] {
    const [start, end] = lineInfo.canvasPoints;

    // Anchor the slab handles near one end of the line (not the midpoint):
    // crossing lines share the viewport center, so midpoint handles from a
    // horizontal and a vertical line would overlap each other.
    const anchorCanvas: Types.Point2 = [
      start[0] + (end[0] - start[0]) * SLAB_HANDLE_LINE_FRACTION,
      start[1] + (end[1] - start[1]) * SLAB_HANDLE_LINE_FRACTION,
    ];

    const slabThickness = this._getSourceSlabThickness(leaderViewport);
    const anchorWorld = targetViewport.canvasToWorld(anchorCanvas);
    const { normal } = lineInfo.leaderPlane;

    const plusWorld: Types.Point3 = [
      anchorWorld[0] + normal[0] * (slabThickness / 2),
      anchorWorld[1] + normal[1] * (slabThickness / 2),
      anchorWorld[2] + normal[2] * (slabThickness / 2),
    ];
    const plusCanvas = targetViewport.worldToCanvas(plusWorld);

    const canvasOffset = Math.hypot(
      plusCanvas[0] - anchorCanvas[0],
      plusCanvas[1] - anchorCanvas[1]
    );

    if (canvasOffset >= MIN_SLAB_HANDLE_CANVAS_OFFSET) {
      const minusWorld: Types.Point3 = [
        anchorWorld[0] - normal[0] * (slabThickness / 2),
        anchorWorld[1] - normal[1] * (slabThickness / 2),
        anchorWorld[2] - normal[2] * (slabThickness / 2),
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
        anchorCanvas[0] + perpendicular[0] * MIN_SLAB_HANDLE_CANVAS_OFFSET,
        anchorCanvas[1] + perpendicular[1] * MIN_SLAB_HANDLE_CANVAS_OFFSET,
      ],
      [
        anchorCanvas[0] - perpendicular[0] * MIN_SLAB_HANDLE_CANVAS_OFFSET,
        anchorCanvas[1] - perpendicular[1] * MIN_SLAB_HANDLE_CANVAS_OFFSET,
      ],
    ];
  }

  // ===================================================================
  // Interactions
  // ===================================================================

  /**
   * The tool never creates real annotations from clicks in empty space:
   * clicking empty canvas never jumps and never stores a point.
   */
  addNewAnnotation = (
    evt: EventTypes.InteractionEventType
  ): SliceIntersectionAnnotation => {
    const { element } = evt.detail;
    const enabledElement = getEnabledElement(element);

    if (!enabledElement) {
      return this._createDetachedAnnotation();
    }

    return (
      this._getOrCreateViewportAnnotation(enabledElement.viewport) ??
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
      LINE_PROXIMITY,
      true
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
   * Click on a line selects its plane group; when dragging is enabled the
   * drag translates every member of the group.
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

    if (this.configuration.draggable) {
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
   * Hover: highlights the plane-group line under the cursor and shows its
   * handles.
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
      LINE_PROXIMITY,
      // Keep the active line (and its handles) while hovering the handles
      // themselves, which sit at a canvas offset from the line.
      true
    );

    let needsRedraw = false;

    if (lineInfo) {
      if (
        this._activeGroupId !== lineInfo.groupId ||
        this._activeTargetViewportId !== viewport.id
      ) {
        this._activeGroupId = lineInfo.groupId;
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
      groupId: lineInfo.groupId,
      family: lineInfo.family,
      memberViewportIds: [...lineInfo.memberViewportIds],
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

    const members = editData.memberViewportIds
      .map((viewportId) => this._getViewportById(viewportId))
      .filter(Boolean) as Types.IViewport[];

    if (!members.length) {
      return;
    }

    switch (editData.operation) {
      case 'translate':
        this._applyTranslate(members, evt, editData);
        break;
      case 'rotate':
        this._applyRotate(members, evt, editData);
        break;
      case 'slabThickness':
        this._applySlabThickness(members, evt, editData);
        break;
    }

    this._renderToolViewports();
  };

  /**
   * Dragging a line translates EVERY member of its plane group: the total
   * drag delta is projected onto each member's own normal, and each member
   * navigates to `its start position + that distance` (stacks and coarser
   * volumes snap to their closest slice of the TRUE position, so no motion
   * is lost to per-tick snapping). Viewports outside the group never move.
   */
  private _applyTranslate(
    members: Types.IViewport[],
    evt: EventTypes.InteractionEventType,
    editData: EditData
  ): void {
    const startWorld = evt.detail.startPoints?.world;
    const currentWorld = evt.detail.currentPoints?.world;
    const deltaWorld = evt.detail.deltaPoints?.world;

    const totalDelta =
      startWorld && currentWorld
        ? vec3.subtract(vec3.create(), currentWorld, startWorld)
        : deltaWorld;
    if (!totalDelta) {
      return;
    }

    const usingTotalDelta = !!(startWorld && currentWorld);
    const memberStartPlanePoints =
      editData?.memberStartPlanePoints ?? new Map<string, Types.Point3>();
    if (editData) {
      editData.memberStartPlanePoints = memberStartPlanePoints;
    }

    members.forEach((member) => {
      const memberPlane = getViewportPlane(member);
      if (!memberPlane) {
        return;
      }

      if (!usingTotalDelta) {
        // Fallback (no start point available): per-tick integration.
        const scrollDistance = vec3.dot(
          totalDelta as Types.Point3,
          memberPlane.normal
        );
        if (translateViewportAlongNormal(member, scrollDistance)) {
          member.render();
        }
        return;
      }

      let startPlanePoint = memberStartPlanePoints.get(member.id);
      if (!startPlanePoint) {
        // First tick: nothing has moved this member yet, so its current
        // plane point is the drag-start anchor.
        startPlanePoint = [...memberPlane.point] as Types.Point3;
        memberStartPlanePoints.set(member.id, startPlanePoint);
      }

      const distance = vec3.dot(totalDelta as Types.Point3, memberPlane.normal);
      const targetPoint: Types.Point3 = [
        startPlanePoint[0] + memberPlane.normal[0] * distance,
        startPlanePoint[1] + memberPlane.normal[1] * distance,
        startPlanePoint[2] + memberPlane.normal[2] * distance,
      ];

      if (navigatePlanarViewportToPoint(member, targetPoint)) {
        member.render();
      }
    });
  }

  /**
   * Dragging a rotation handle reorients the volume-backed members of the
   * plane group together around the shared pivot, about the target viewport
   * view-plane normal. Image stacks cannot be reoriented and are skipped
   * (they keep following translations only).
   */
  private _applyRotate(
    members: Types.IViewport[],
    evt: EventTypes.InteractionEventType,
    editData: EditData
  ): void {
    const { pivotWorld, rotationAxis, targetViewportId } = editData;
    if (!pivotWorld || !rotationAxis) {
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

    const cross = dir1[0] * dir2[1] - dir1[1] * dir2[0];
    if (cross > 0) {
      angle *= -1;
    }

    // Round so a rotation can be undone by rotating back by the same amount.
    angle = Math.round(angle * 100) / 100;
    if (angle === 0) {
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

    editData.memberStartScales ??= new Map();

    members.forEach((member) => {
      if (!this._isVolumeModeViewport(member)) {
        return;
      }

      const { viewPlaneNormal, viewUp } = getViewportICamera(member);
      if (!viewPlaneNormal || !viewUp) {
        return;
      }

      const scalableMember = member as Types.IViewport & {
        getScale?: () => unknown;
        setScale?: (scale: unknown) => void;
      };

      // Capture the on-screen scale at drag start: fit-based scaling refits
      // the new oblique extent on every orientation write, which would pulse
      // the zoom while rotating.
      if (!editData.memberStartScales.has(member.id)) {
        editData.memberStartScales.set(
          member.id,
          scalableMember.getScale?.() ?? null
        );
      }

      const newViewPlaneNormal = vec3.transformMat4(
        vec3.create(),
        viewPlaneNormal,
        rotation
      );
      const newViewUp = vec3.transformMat4(vec3.create(), viewUp, rotation);

      (member as Types.IGenericViewport).setViewReference({
        viewPlaneNormal: [
          newViewPlaneNormal[0],
          newViewPlaneNormal[1],
          newViewPlaneNormal[2],
        ],
        viewUp: [newViewUp[0], newViewUp[1], newViewUp[2]],
        cameraFocalPoint: [pivotWorld[0], pivotWorld[1], pivotWorld[2]],
      } as Types.ViewReference);

      const startScale = editData.memberStartScales.get(member.id);
      if (startScale) {
        scalableMember.setScale?.(startScale);
      }

      member.render();
    });
  }

  /**
   * Dragging a slab handle sets the slab thickness (twice the distance of
   * the cursor from the leader slice plane) on every volume-backed member of
   * the plane group, through the display-set presentation API. No slab state
   * is stored on the tool.
   */
  private _applySlabThickness(
    members: Types.IViewport[],
    evt: EventTypes.InteractionEventType,
    editData: EditData
  ): void {
    const currentWorld = evt.detail.currentPoints?.world;
    if (!currentWorld) {
      return;
    }

    const leader = members.find((member) => this._isVolumeModeViewport(member));
    const leaderPlane = leader && getViewportPlane(leader);
    if (!leaderPlane) {
      return;
    }

    const slabThickness = Math.max(
      RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS,
      Math.abs(distancePointToPlane(currentWorld, leaderPlane)) * 2
    );

    let changed = false;
    members.forEach((member) => {
      if (this._setViewportSlabThickness(member, slabThickness)) {
        changed = true;
      }
    });

    if (changed) {
      triggerEvent(
        eventTarget,
        Events.SLICE_INTERSECTION_SLAB_THICKNESS_CHANGED,
        this._getManipulationDetail('slabThickness', editData)
      );
    }
  }

  /**
   * Writes the slab thickness of one volume-backed member through its
   * display-set presentation. Returns true when a change was applied.
   */
  private _setViewportSlabThickness(
    viewport: Types.IViewport,
    slabThickness: number
  ): boolean {
    if (!this._isVolumeModeViewport(viewport)) {
      return false;
    }

    const dataId = this._getSourceDataId(viewport);
    if (!dataId) {
      return false;
    }

    const currentSlabThickness = this._getSourceSlabThickness(viewport);
    if (Math.abs(currentSlabThickness - slabThickness) < 1e-6) {
      return false;
    }

    let blendMode = this.configuration.slabThicknessBlendMode;
    if (slabThickness <= RENDERING_DEFAULTS.MINIMUM_SLAB_THICKNESS) {
      blendMode = Enums.BlendModes.COMPOSITE;
    }

    (viewport as Types.IGenericViewport).setDisplaySetPresentation(dataId, {
      slabThickness,
      blendMode,
    });
    viewport.render();

    return true;
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
    if (!viewport || !this._isPlanarViewport(viewport)) {
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
   * Reads the viewport slab thickness from its display-set presentation;
   * defaults to the minimum slab thickness.
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
    this._activeGroupId = lineInfo.groupId;
    this._activeTargetViewportId = lineInfo.targetViewportId;

    triggerEvent(eventTarget, Events.SLICE_INTERSECTION_LINE_SELECTED, {
      toolGroupId: this.toolGroupId,
      groupId: lineInfo.groupId,
      targetViewportId: lineInfo.targetViewportId,
    } as SliceIntersectionLineSelectedEventDetail);
  }

  /**
   * Finds the rendered line near the canvas point. When `includeHandles` is
   * set, proximity to the line's rotation/slab handles also counts: the slab
   * handles sit at a canvas offset from the line itself, and hover must not
   * drop the active state (hiding the handles) while the cursor travels from
   * the line onto a handle.
   */
  private _findLineNear(
    viewportId: string,
    canvasCoords: Types.Point2,
    proximity: number,
    includeHandles = false
  ): RenderedIntersectionLine | null {
    const lines = this._renderedLines.get(viewportId) ?? [];
    const handleReach = this.configuration.handleRadius + proximity;

    for (const lineInfo of lines) {
      const distance = lineSegment.distanceToPoint(
        lineInfo.canvasPoints[0],
        lineInfo.canvasPoints[1],
        canvasCoords
      );

      if (distance <= proximity) {
        return lineInfo;
      }

      if (includeHandles) {
        const nearHandle = [
          ...lineInfo.rotateHandles,
          ...lineInfo.slabHandles,
        ].some(
          (handle) =>
            Math.hypot(
              handle[0] - canvasCoords[0],
              handle[1] - canvasCoords[1]
            ) <= handleReach
        );

        if (nearHandle) {
          return lineInfo;
        }
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

  private _getManipulationDetail(
    operation: SliceIntersectionOperation,
    editData: EditData | null = this._editData
  ): SliceIntersectionManipulationEventDetail {
    return {
      toolGroupId: this.toolGroupId,
      groupId: editData?.groupId ?? this._activeGroupId ?? '',
      family: editData?.family,
      viewportIds: editData?.memberViewportIds ?? [],
      targetViewportId:
        editData?.targetViewportId ?? this._activeTargetViewportId ?? '',
      operation,
    };
  }
}

SliceIntersectionTool.toolName = 'SliceIntersection';
export default SliceIntersectionTool;
