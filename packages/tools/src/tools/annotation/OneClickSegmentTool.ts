import {
  cache,
  Enums as CoreEnums,
  eventTarget,
  utilities as csUtils,
  getEnabledElement,
  getRenderingEngine,
} from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type { EventTypes, PublicToolProps, ToolProps } from '../../types';

import GrowCutBaseTool from '../base/GrowCutBaseTool';
import type { GrowCutToolData } from '../base/GrowCutBaseTool';
import { runFloodFillSegmentation } from '../../utilities/segmentation/growCut/runFloodFillSegmentation';
import { floodFill3dSliceLazy } from '../../utilities/segmentation/floodFillSliceLazy';
import {
  probeAdaptiveRegion,
  resolveAdaptiveBandAtTolerance,
  resolveInPlaneAxes,
} from '../../utilities/segmentation/growCut/intensityRange/adaptiveRegionIntensityRange';
import type {
  AdaptiveRegionExpandContext,
  AdaptiveRegionProbeResult,
} from '../../utilities/segmentation/growCut/intensityRange/adaptiveRegionIntensityRange';
import type { FloodFillIntensityRangeOptions } from '../../utilities/segmentation/growCut/floodFillIntensityRangeTypes';
import { getViewportVoiMappingForVolume } from '../../utilities/segmentation/growCut/getViewportVoiMappingForVolume';
import { activeSegmentation } from '../../stateManagement/segmentation';
import { triggerSegmentationDataModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import {
  PLUS_CURSOR,
  BLOCKED_CURSOR,
  PENDING_CURSOR,
} from './regionSegmentHoverCursors';
import { ToolModes } from '../../enums';

const { growCutLog } = csUtils.logger;

/** Coalesce hover probes to at most one per interval (leading + trailing). */
const HOVER_PROBE_THROTTLE_MS = 100;
/** A click within this canvas distance of the last probe reuses its verdict. */
const PROBE_REUSE_DISTANCE_PX = 6;
/** Probe verdicts older than this are ignored (slice may have changed). */
const PROBE_FRESH_MS = 1500;
/** Expand aims for the first curve step at least this much larger. */
const EXPAND_STEP_FACTOR = 1.15;
/** Shrink aims for the last curve step at least this much smaller. */
const SHRINK_STEP_FACTOR = 0.85;
/**
 * Lesion-ness is judged by SHAPE, not size: the would-be segment must be one
 * coherent entity. Its volume must fill at least this fraction of its 3D
 * bounding box — solid blobs (even large ones) score 0.2–0.6, while sprawling
 * webs like chained bones or noise score far below. Checked periodically as
 * the fill grows (early rejection) and on the final region.
 */
const MIN_COMPACTNESS = 0.08;
/** Compactness only applies past this volume (tiny fills are trivially ok). */
const COMPACTNESS_CHECK_MIN_VOLUME_MM3 = 2000;
/**
 * Pure compute safety, far above any plausible lesion (≈16 cm sphere).
 * Never the criterion — shape gates fire long before it.
 */
const COMPUTE_BUDGET_MM3 = 2_000_000;
/** Marker for shape/budget rejections so callers phrase the error correctly. */
const NOT_LESION_MESSAGE =
  'The region here does not form a self-contained, lesion-like shape; nothing was segmented.';
/** Dry-run flood yields (voxels) — coarse, it only checks the shape gate. */
const DRY_RUN_YIELD_EVERY = 10_000;
/** Neighbor votes (of 4, at ±1 voxel) required in addition to the center. */
const CONSENSUS_MIN_NEIGHBOR_VOTES = 2;
/**
 * Verdicts attach to REGIONS, not pixels, for this long: a confirmed lesion
 * is one contiguous plus zone (its actual 3D extent), and a rejected seed
 * blocks its whole neighborhood — so the cursor cannot flicker pixel to
 * pixel across the same structure.
 */
const VERDICT_CACHE_TTL_MS = 2500;
/** Max rejected regions remembered. */
const MAX_REJECTED_REGIONS = 8;

type HoverProbeVerdict = {
  viewportId: string;
  canvas: Types.Point2;
  sliceIndex: number | null;
  ok: boolean;
  at: number;
};

type LastClickState = {
  expandContext: AdaptiveRegionExpandContext;
  /** Threshold depth the labelmap currently reflects. */
  toleranceBytes: number;
  worldPoint: Types.Point3;
  /** Labelmap ijk voxels painted by the last run (pre island removal). */
  filledPoints: Types.Point3[];
  segmentation: GrowCutToolData['segmentation'];
  viewportId: string;
  renderingEngineId: string;
};

/**
 * One-click segmentation with a trustworthy grow/shrink workflow, built for
 * PET-style hot lesions but modality-agnostic:
 *
 * - **Hover** previews segmentability: plus cursor = one click here produces a
 *   meaningful segment; blocked cursor = it will not (flat area, noise speck,
 *   or an unbounded region). Clicks on blocked spots are no-ops.
 * - **Click** derives a one-sided intensity threshold dynamically (everything
 *   at least as intense as the clicked structure, connected to it), so the
 *   hottest core of a lesion is always included — no interior holes.
 * - **expand()/shrink()** step deterministically along the growth curve that
 *   was measured at click time: each step clears the previous result and
 *   refills at the next/previous stable threshold, so the segment visibly
 *   grows or shrinks with every step.
 *
 * There is nothing to configure: no disk radii, no strategies, no deltas.
 */
class OneClickSegmentTool extends GrowCutBaseTool {
  static toolName = 'OneClickSegment';
  private segmentationInProgress = false;
  private hoverThrottleTimer: number | null = null;
  private pendingHoverEvent: EventTypes.MouseMoveEventType | null = null;
  private lastHoverElement: HTMLDivElement | null = null;
  private lastProbe: HoverProbeVerdict | null = null;
  private lastClick: LastClickState | null = null;
  private clickAbortController: AbortController | null = null;
  private dryRunToken: { cancelled: boolean } | null = null;
  private confirmedRegion: {
    viewportId: string;
    bbox: { min: Types.Point3; max: Types.Point3 };
    bandMin: number;
    bandMax: number;
    expiresAt: number;
  } | null = null;
  /**
   * Regions a dry-run rejected: their explored bbox + band. Any new seed on
   * the same structure (inside the box, matching intensity) is blocked
   * instantly — no re-run, no per-pixel re-evaluation across a bone.
   */
  private rejectedRegions: Array<{
    viewportId: string;
    bbox: { min: Types.Point3; max: Types.Point3 };
    bandMin: number;
    bandMax: number;
    expiresAt: number;
  }> = [];

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        /** Through-slice safety bound for the 3D fill. */
        maxDeltaK: 25,
        /** In-plane safety bound for the 3D fill. */
        maxDeltaIJ: 512,
        actions: {
          cancelInProgress: {
            method: 'cancelInProgress',
            bindings: [
              {
                key: 'Escape',
              },
            ],
          },
        },
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  private notifySegmentationError(message: string): void {
    const event = new CustomEvent(CoreEnums.Events.ERROR_EVENT, {
      detail: {
        type: 'Segmentation',
        message,
      },
      cancelable: true,
    });
    eventTarget.dispatchEvent(event);
  }

  public cancelInProgress(): boolean {
    return this.cancelActiveOperation();
  }

  public cancelActiveOperation(): boolean {
    if (
      !this.clickAbortController ||
      this.clickAbortController.signal.aborted
    ) {
      return false;
    }
    this.clickAbortController.abort();
    return true;
  }

  private clearHoverState(): void {
    if (this.hoverThrottleTimer !== null) {
      window.clearTimeout(this.hoverThrottleTimer);
      this.hoverThrottleTimer = null;
    }
    this.pendingHoverEvent = null;
    this.lastProbe = null;
    this.confirmedRegion = null;
    this.rejectedRegions = [];
    if (this.dryRunToken) {
      this.dryRunToken.cancelled = true;
      this.dryRunToken = null;
    }
    if (this.lastHoverElement) {
      this.lastHoverElement.style.cursor = '';
      this.lastHoverElement = null;
    }
  }

  /**
   * Fast path: the pointer sits on an entity a dry-run already confirmed —
   * inside its 3D bounding box and within its intensity band. The whole
   * lesion is one contiguous plus zone.
   */
  private pointerOnConfirmedRegion(
    refVolume: Types.IImageVolume,
    viewport: Types.IViewport,
    world: Types.Point3
  ): boolean {
    const region = this.confirmedRegion;
    if (
      !region ||
      region.viewportId !== viewport.id ||
      Date.now() > region.expiresAt
    ) {
      return false;
    }
    const ijk = csUtils
      .transformWorldToIndex(refVolume.imageData, world)
      .map(Math.round) as Types.Point3;
    for (let axis = 0; axis < 3; axis++) {
      if (
        ijk[axis] < region.bbox.min[axis] ||
        ijk[axis] > region.bbox.max[axis]
      ) {
        return false;
      }
    }
    const [width, height] = refVolume.dimensions;
    const scalar = Number(
      refVolume.voxelManager.getAtIndex(
        ijk[2] * width * height + ijk[1] * width + ijk[0]
      )
    );
    if (
      !Number.isFinite(scalar) ||
      scalar < region.bandMin ||
      scalar > region.bandMax
    ) {
      return false;
    }
    region.expiresAt = Date.now() + VERDICT_CACHE_TTL_MS;
    return true;
  }

  /**
   * True when the seed sits on a structure a dry-run already rejected: inside
   * the rejected region's explored bounding box AND matching its intensity
   * band. Bands here are one-sided, so any pixel of the same structure
   * (whatever local maximum the seed snapped to) matches.
   */
  private matchesRejectedRegion(
    viewportId: string,
    refVolume: Types.IImageVolume,
    seed: Types.Point3
  ): boolean {
    const now = Date.now();
    this.rejectedRegions = this.rejectedRegions.filter(
      (entry) => entry.expiresAt > now
    );
    const [width, height] = refVolume.dimensions;
    const scalar = Number(
      refVolume.voxelManager.getAtIndex(
        seed[2] * width * height + seed[1] * width + seed[0]
      )
    );
    const match = this.rejectedRegions.find((entry) => {
      if (entry.viewportId !== viewportId) {
        return false;
      }
      for (let axis = 0; axis < 3; axis++) {
        if (
          seed[axis] < entry.bbox.min[axis] ||
          seed[axis] > entry.bbox.max[axis]
        ) {
          return false;
        }
      }
      return (
        Number.isFinite(scalar) &&
        scalar >= entry.bandMin &&
        scalar <= entry.bandMax
      );
    });
    if (match) {
      match.expiresAt = now + VERDICT_CACHE_TTL_MS;
      return true;
    }
    return false;
  }

  private rememberRejectedRegion(
    viewportId: string,
    bbox: { min: Types.Point3; max: Types.Point3 } | null,
    bandMin: number,
    bandMax: number
  ): void {
    if (!bbox) {
      return;
    }
    this.rejectedRegions.push({
      viewportId,
      bbox: {
        min: [...bbox.min] as Types.Point3,
        max: [...bbox.max] as Types.Point3,
      },
      bandMin,
      bandMax,
      expiresAt: Date.now() + VERDICT_CACHE_TTL_MS,
    });
    if (this.rejectedRegions.length > MAX_REJECTED_REGIONS) {
      this.rejectedRegions.splice(
        0,
        this.rejectedRegions.length - MAX_REJECTED_REGIONS
      );
    }
  }

  private safeSpacing(volume: Types.IImageVolume): [number, number, number] {
    const spacing = volume.spacing ?? [1, 1, 1];
    return [0, 1, 2].map((axis) =>
      Number.isFinite(spacing[axis]) && spacing[axis] > 0 ? spacing[axis] : 1
    ) as [number, number, number];
  }

  /** Compute-safety voxel budget for {@link COMPUTE_BUDGET_MM3}. */
  private computeVoxelBudget(volume: Types.IImageVolume): number {
    const [sx, sy, sz] = this.safeSpacing(volume);
    return Math.max(1000, Math.ceil(COMPUTE_BUDGET_MM3 / (sx * sy * sz)));
  }

  /**
   * Entity-coherence gate ("is this one lesion?"): the region must end on its
   * own inside the through-slice window (not be cut off by the safety clamp
   * on both sides) and stay compact — its volume filling a sensible fraction
   * of its own bounding box. No absolute size or extent limits: a large solid
   * lesion passes; chained bones, organs bleeding into neighbors, and noise
   * webs fail. Used both periodically while the fill grows and on the final
   * region, by the click, expand/shrink, and the hover dry-run alike.
   */
  private makeRegionShapeGate(
    volume: Types.IImageVolume
  ): (stats: {
    voxelCount: number;
    bbox: { min: Types.Point3; max: Types.Point3 };
  }) => boolean {
    const spacing = this.safeSpacing(volume);
    const voxelVolumeMm3 = spacing[0] * spacing[1] * spacing[2];
    const maxDeltaK = this.configuration.maxDeltaK;
    return ({ voxelCount, bbox }) => {
      if (maxDeltaK) {
        const kExtent = bbox.max[2] - bbox.min[2] + 1;
        if (kExtent >= 2 * maxDeltaK + 1) {
          return false;
        }
      }
      const volumeMm3 = voxelCount * voxelVolumeMm3;
      if (volumeMm3 < COMPACTNESS_CHECK_MIN_VOLUME_MM3) {
        return true;
      }
      let bboxMm3 = 1;
      for (let axis = 0; axis < 3; axis++) {
        bboxMm3 *= (bbox.max[axis] - bbox.min[axis] + 1) * spacing[axis];
      }
      return volumeMm3 / bboxMm3 >= MIN_COMPACTNESS;
    };
  }

  onSetToolPassive(): void {
    this.clearHoverState();
  }

  onSetToolDisabled(): void {
    this.clearHoverState();
  }

  private buildProbeOptions(
    viewport: Types.IViewport,
    element: HTMLDivElement,
    referencedVolumeId: string
  ): FloodFillIntensityRangeOptions {
    return {
      viewport,
      element,
      referencedVolumeId,
      voiMapping:
        getViewportVoiMappingForVolume(viewport, referencedVolumeId) ??
        undefined,
    };
  }

  mouseMoveCallback(evt: EventTypes.MouseMoveEventType) {
    if (this.mode !== ToolModes.Active) {
      return;
    }

    const { element } = evt.detail;
    this.lastHoverElement = element;

    if (this.segmentationInProgress) {
      element.style.cursor = 'wait';
      return;
    }

    this.queueHoverProbe(evt);
  }

  /**
   * Leading + trailing throttle so a moving pointer probes immediately, then
   * at most once per {@link HOVER_PROBE_THROTTLE_MS} while it keeps moving.
   */
  private queueHoverProbe(evt: EventTypes.MouseMoveEventType): void {
    this.pendingHoverEvent = evt;
    if (this.hoverThrottleTimer !== null) {
      return;
    }
    this.flushHoverProbe();
  }

  private flushHoverProbe(): void {
    const evt = this.pendingHoverEvent;
    this.pendingHoverEvent = null;
    if (!evt) {
      return;
    }
    void this.runHoverProbe(evt);
    this.hoverThrottleTimer = window.setTimeout(() => {
      this.hoverThrottleTimer = null;
      if (this.pendingHoverEvent) {
        this.flushHoverProbe();
      }
    }, HOVER_PROBE_THROTTLE_MS);
  }

  private getViewportSliceIndex(viewport: Types.IViewport): number | null {
    const getSliceIndex = (
      viewport as Types.IViewport & { getSliceIndex?: () => number }
    ).getSliceIndex;
    if (typeof getSliceIndex !== 'function') {
      return null;
    }
    try {
      const sliceIndex = getSliceIndex.call(viewport);
      return Number.isFinite(sliceIndex) ? sliceIndex : null;
    } catch {
      return null;
    }
  }

  /**
   * Probes the pointer with the same function a click would run and reflects
   * the verdict in the cursor: plus = meaningful segment here, blocked = not.
   */
  private async runHoverProbe(
    evt: EventTypes.MouseMoveEventType
  ): Promise<void> {
    if (this.mode !== ToolModes.Active || this.segmentationInProgress) {
      return;
    }
    const { element, currentPoints } = evt.detail;
    const enabledElement = getEnabledElement(element);
    const viewport = enabledElement?.viewport;
    if (!viewport) {
      return;
    }

    // Every probe invalidates any in-flight 3D dry-run for the previous spot.
    if (this.dryRunToken) {
      this.dryRunToken.cancelled = true;
      this.dryRunToken = null;
    }

    // Verdict states: 'plus' (confirmed lesion), 'blocked', 'pending'
    // (candidate awaiting 3D confirmation — plus is NEVER shown
    // optimistically, so it cannot flicker), 'unknown' (cannot evaluate).
    let state: 'plus' | 'blocked' | 'pending' | 'unknown' = 'unknown';
    let dryRunInput: {
      refVolume: Types.IImageVolume;
      range: NonNullable<AdaptiveRegionProbeResult['range']>;
    } | null = null;
    try {
      if (activeSegmentation.getActiveSegmentation(viewport.id)) {
        const labelmapData = await this.getLabelmapSegmentationData(viewport);
        if (labelmapData) {
          const { referencedVolumeId } = labelmapData;
          if (!this._isOrthogonalView(viewport, referencedVolumeId)) {
            state = 'blocked';
          } else {
            const refVolume = cache.getVolume(referencedVolumeId);
            if (refVolume) {
              // Fast path: still on an entity a dry-run already confirmed —
              // the whole lesion is one contiguous plus zone.
              if (
                this.pointerOnConfirmedRegion(
                  refVolume,
                  viewport,
                  currentPoints.world
                )
              ) {
                state = 'plus';
              } else {
                const options = this.buildProbeOptions(
                  viewport,
                  element,
                  referencedVolumeId
                );
                const probe = probeAdaptiveRegion(
                  refVolume,
                  currentPoints.world,
                  options
                );
                if (!probe.viable || !probe.range) {
                  state = 'blocked';
                } else if (
                  this.matchesRejectedRegion(
                    viewport.id,
                    refVolume,
                    probe.range.ijkStart
                  )
                ) {
                  // This structure was just rejected in 3D — same verdict for
                  // the whole structure, no flicker, no re-run.
                  state = 'blocked';
                } else if (
                  !this.neighborsAgree(
                    refVolume,
                    viewport,
                    currentPoints.world,
                    options
                  )
                ) {
                  state = 'blocked';
                } else {
                  state = 'pending';
                  dryRunInput = { refVolume, range: probe.range };
                }
              }
            }
          }
        }
      }
    } catch (err) {
      growCutLog.debug('hover probe: could not evaluate', {
        message: err instanceof Error ? err.message : String(err),
      });
      state = 'unknown';
    }

    // While pending/unknown the click stays allowed — the fill re-validates
    // everything anyway; only an explicit 'blocked' gates it.
    const verdict: HoverProbeVerdict | null =
      state === 'unknown'
        ? null
        : {
            viewportId: viewport.id,
            canvas: [...currentPoints.canvas] as Types.Point2,
            sliceIndex: this.getViewportSliceIndex(viewport),
            ok: state !== 'blocked',
            at: Date.now(),
          };
    this.lastProbe = verdict;

    // Green is reserved for a CONFIRMED plus; pending/unknown show the gray
    // evaluating cursor so they can never be mistaken for "segmentable".
    element.style.cursor =
      state === 'plus'
        ? PLUS_CURSOR
        : state === 'blocked'
          ? BLOCKED_CURSOR
          : PENDING_CURSOR;

    // The 2D probe cannot see 3D connectivity (e.g. CT bones chaining across
    // slices). The plus cursor only appears once the budgeted 3D dry-run
    // confirms a coherent lesion-like entity.
    if (state === 'pending' && dryRunInput && verdict) {
      const token = { cancelled: false };
      this.dryRunToken = token;
      void this.runConfinementDryRun(
        dryRunInput.refVolume,
        dryRunInput.range,
        token,
        verdict,
        element
      );
    }
  }

  /**
   * Consensus polling: probes the 4 in-plane neighbors one voxel away and
   * requires at least {@link CONSENSUS_MIN_NEIGHBOR_VOTES} of them to also be
   * viable. A lesion is a zone, so its plus verdict should be spatially
   * stable — not "plus here, blocked one pixel left and right".
   */
  private neighborsAgree(
    refVolume: Types.IImageVolume,
    viewport: Types.IViewport,
    world: Types.Point3,
    options: FloodFillIntensityRangeOptions
  ): boolean {
    const { imageData } = refVolume;
    const ijk = csUtils
      .transformWorldToIndex(imageData, world)
      .map(Math.round) as Types.Point3;
    const [axisA, axisB] = resolveInPlaneAxes(refVolume, viewport);
    const offsets: Array<[number, number]> = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    let votes = 0;
    let evaluated = 0;
    for (const [da, db] of offsets) {
      const neighborIjk = [...ijk] as Types.Point3;
      neighborIjk[axisA] += da;
      neighborIjk[axisB] += db;
      if (
        neighborIjk.some(
          (value, axis) => value < 0 || value >= refVolume.dimensions[axis]
        )
      ) {
        continue;
      }
      evaluated++;
      const neighborWorld = csUtils.transformIndexToWorld(
        imageData,
        neighborIjk
      ) as Types.Point3;
      if (probeAdaptiveRegion(refVolume, neighborWorld, options).viable) {
        votes++;
      }
      if (votes >= CONSENSUS_MIN_NEIGHBOR_VOTES) {
        return true;
      }
    }
    // At the volume edge with too few evaluable neighbors, don't punish.
    return evaluated < CONSENSUS_MIN_NEIGHBOR_VOTES
      ? votes === evaluated
      : votes >= CONSENSUS_MIN_NEIGHBOR_VOTES;
  }

  /**
   * Shape-gated 3D flood (no painting) that verifies the would-be segment is
   * one coherent, lesion-like entity. On failure, downgrades the hover
   * verdict and cursor so the click is blocked before ever running.
   */
  private async runConfinementDryRun(
    refVolume: Types.IImageVolume,
    range: NonNullable<AdaptiveRegionProbeResult['range']>,
    token: { cancelled: boolean },
    verdict: HoverProbeVerdict,
    element: HTMLDivElement
  ): Promise<void> {
    const { dimensions } = refVolume;
    const [width, height, depth] = dimensions;
    const pixelsPerSlice = width * height;
    const voxelManager = refVolume.voxelManager as unknown as {
      getAtIndex: (index: number) => number;
    };
    const { min, max } = range;
    const shapeGate = this.makeRegionShapeGate(refVolume);

    try {
      const { truncated, voxelCount, bbox } = await floodFill3dSliceLazy(
        (x, y, z) =>
          Number(voxelManager.getAtIndex(z * pixelsPerSlice + y * width + x)),
        [...range.ijkStart] as Types.Point3,
        {
          width,
          height,
          depth,
          equals: (val) =>
            typeof val === 'number' &&
            Number.isFinite(val) &&
            val >= min &&
            val <= max,
          yieldEvery: DRY_RUN_YIELD_EVERY,
          maxDeltaK: this.configuration.maxDeltaK,
          maxDeltaIJ: this.configuration.maxDeltaIJ,
          isCancelled: () => token.cancelled,
          maxVoxels: this.computeVoxelBudget(refVolume),
          shouldContinue: shapeGate,
        }
      );
      if (token.cancelled) {
        return;
      }
      const lesionLike = !truncated && bbox && shapeGate({ voxelCount, bbox });
      if (lesionLike) {
        // Attach the plus verdict to the ENTITY: everything inside this
        // region shows plus without re-running (a contiguous plus zone).
        this.confirmedRegion = {
          viewportId: verdict.viewportId,
          bbox,
          bandMin: min,
          bandMax: max,
          expiresAt: Date.now() + VERDICT_CACHE_TTL_MS,
        };
        if (this.lastProbe === verdict) {
          verdict.ok = true;
          element.style.cursor = PLUS_CURSOR;
        }
      } else {
        this.rememberRejectedRegion(verdict.viewportId, bbox, min, max);
        if (this.lastProbe === verdict) {
          verdict.ok = false;
          element.style.cursor = BLOCKED_CURSOR;
        }
      }
    } catch (err) {
      growCutLog.debug('hover dry-run: could not evaluate', {
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      if (this.dryRunToken === token) {
        this.dryRunToken = null;
      }
    }
  }

  /**
   * True when the last hover probe evaluated (approximately) the click point
   * and is still current for the viewport's displayed slice.
   */
  private probeAppliesToClick(
    viewport: Types.IViewport,
    canvas: Types.Point2
  ): boolean {
    const probe = this.lastProbe;
    if (!probe || probe.viewportId !== viewport.id) {
      return false;
    }
    if (Date.now() - probe.at > PROBE_FRESH_MS) {
      return false;
    }
    if (probe.sliceIndex !== this.getViewportSliceIndex(viewport)) {
      return false;
    }
    const dx = canvas[0] - probe.canvas[0];
    const dy = canvas[1] - probe.canvas[1];
    return Math.sqrt(dx * dx + dy * dy) <= PROBE_REUSE_DISTANCE_PX;
  }

  async preMouseDownCallback(
    evt: EventTypes.MouseDownActivateEventType
  ): Promise<boolean> {
    if (this.segmentationInProgress) {
      return false;
    }

    const { currentPoints, element } = evt.detail;
    const { world: worldPoint, canvas: canvasPoint } = currentPoints;

    const enabledElement = element ? getEnabledElement(element) : undefined;
    if (
      enabledElement?.viewport &&
      this.probeAppliesToClick(enabledElement.viewport, canvasPoint) &&
      this.lastProbe?.ok === false
    ) {
      growCutLog.info('click ignored: hover probe reported no proper region', {
        canvasPoint,
      });
      return false;
    }

    const setupOk = await super.preMouseDownCallback(evt);
    if (!setupOk || !this.growCutData) {
      return false;
    }

    const clickData = this.growCutData;
    this.growCutData = null;

    void this.runClick(clickData, worldPoint, element).catch((err) => {
      const message =
        err instanceof Error ? err.message : 'One-click segmentation failed.';
      this.notifySegmentationError(message);
      growCutLog.error('OneClickSegment: segmentation failed', { message });
    });

    return true;
  }

  private async runClick(
    clickData: GrowCutToolData,
    worldPoint: Types.Point3,
    element: HTMLDivElement | undefined
  ): Promise<void> {
    const { segmentation, viewportId, renderingEngineId } = clickData;
    const { referencedVolumeId, labelmapVolumeId, segmentIndex } = segmentation;

    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine?.getViewport(viewportId);
    if (!viewport) {
      throw new Error('OneClickSegment: viewport not found for click.');
    }
    const refVolume = cache.getVolume(referencedVolumeId);
    const labelmapVolume = cache.getVolume(labelmapVolumeId);
    if (!refVolume || !labelmapVolume) {
      throw new Error(
        'OneClickSegment: referenced or labelmap volume not in cache.'
      );
    }

    const probe = probeAdaptiveRegion(
      refVolume,
      worldPoint,
      this.buildProbeOptions(viewport, viewport.element, referencedVolumeId)
    );
    if (!probe.viable || !probe.range || !probe.expandContext) {
      growCutLog.info('OneClickSegment: click found no meaningful region', {
        reason: probe.reason,
        regionAreaMm2: probe.regionAreaMm2,
      });
      this.notifySegmentationError(
        'No meaningful region at the clicked location. Move the pointer until the plus cursor appears.'
      );
      return;
    }

    growCutLog.info('OneClickSegment: click', {
      worldPoint,
      toleranceBytes: probe.toleranceBytes,
      regionAreaMm2: probe.regionAreaMm2,
      band: { min: probe.range.min, max: probe.range.max },
    });

    const filledPoints = await this.fillWithRange(
      probe.range,
      {
        segmentation,
        viewportId,
        renderingEngineId,
      },
      viewport,
      labelmapVolume,
      element
    );

    this.lastClick = {
      expandContext: probe.expandContext,
      toleranceBytes: probe.expandContext.chosenToleranceBytes,
      worldPoint: [...worldPoint] as Types.Point3,
      filledPoints,
      segmentation,
      viewportId,
      renderingEngineId,
    };
    growCutLog.info('OneClickSegment: click complete', {
      filledVoxels: filledPoints.length,
      segmentIndex,
    });
  }

  /**
   * Runs the 3D fill for an explicit band and returns the painted points.
   * Shared by click and expand/shrink refills.
   */
  private async fillWithRange(
    range: NonNullable<AdaptiveRegionProbeResult['range']>,
    target: {
      segmentation: GrowCutToolData['segmentation'];
      viewportId: string;
      renderingEngineId: string;
    },
    viewport: Types.IViewport,
    labelmapVolume: Types.IImageVolume,
    element: HTMLDivElement | undefined
  ): Promise<Types.Point3[]> {
    const { segmentation } = target;
    const { referencedVolumeId, segmentIndex, segmentationId } = segmentation;

    this.segmentationInProgress = true;
    if (element) {
      element.style.cursor = 'wait';
    }
    const abortController = new AbortController();
    this.clickAbortController = abortController;

    let filledPoints: Types.Point3[] = [];
    let notLesionLike = false;
    try {
      const referencedVolume = cache.getVolume(referencedVolumeId);
      const result = await runFloodFillSegmentation({
        referencedVolumeId,
        worldPosition: this.indexToWorld(referencedVolume, range.ijkStart),
        viewport,
        labelmapVolume,
        options: {
          segmentIndex,
          getIntensityRange: () => range,
          element: viewport.element,
          applyExternalIslandRemoval: true,
          applyInternalIslandRemoval: true,
          maxDeltaK: this.configuration.maxDeltaK,
          maxDeltaIJ: this.configuration.maxDeltaIJ,
          isCancelled: () => abortController.signal.aborted,
          maxVoxels: this.computeVoxelBudget(referencedVolume),
          shouldContinueRegion: this.makeRegionShapeGate(referencedVolume),
          onRejected: ({ voxelCount, bbox }) => {
            notLesionLike = true;
            growCutLog.info('OneClickSegment: fill rejected by shape gate', {
              voxelCount,
              bbox,
            });
          },
          onCommitted: (points) => {
            filledPoints = points;
          },
        },
      });
      if (!result) {
        throw new Error(
          notLesionLike
            ? NOT_LESION_MESSAGE
            : 'OneClickSegment: fill produced no result (band rejected).'
        );
      }
      triggerSegmentationDataModified(segmentationId);
      return filledPoints;
    } finally {
      if (this.clickAbortController === abortController) {
        this.clickAbortController = null;
      }
      this.segmentationInProgress = false;
      if (element) {
        element.style.cursor = PENDING_CURSOR;
      }
    }
  }

  private indexToWorld(
    volume: Types.IImageVolume,
    ijk: Types.Point3
  ): Types.Point3 {
    return csUtils.transformIndexToWorld(volume.imageData, ijk) as Types.Point3;
  }

  /** Region size (in-plane px) the growth curve predicts for a tolerance. */
  private curveSizeAt(
    context: AdaptiveRegionExpandContext,
    toleranceBytes: number
  ): number {
    let size = 0;
    for (const [level, levelSize] of context.growthCurve) {
      if (level > toleranceBytes) {
        break;
      }
      size = levelSize;
    }
    return size;
  }

  /**
   * Picks the next tolerance along the click-time growth curve, requiring a
   * visible region change (at least ~15% larger / smaller). Returns null when
   * there is no further step in that direction.
   */
  private pickNextTolerance(direction: 1 | -1): number | null {
    const lastClick = this.lastClick;
    if (!lastClick) {
      return null;
    }
    const { expandContext, toleranceBytes } = lastClick;
    const currentSize = this.curveSizeAt(expandContext, toleranceBytes);

    if (direction > 0) {
      for (const [level, size] of expandContext.growthCurve) {
        if (level <= toleranceBytes) {
          continue;
        }
        if (
          size >= Math.max(currentSize + 1, currentSize * EXPAND_STEP_FACTOR)
        ) {
          return level;
        }
      }
      return null;
    }

    for (
      let index = expandContext.growthCurve.length - 1;
      index >= 0;
      index--
    ) {
      const [level, size] = expandContext.growthCurve[index];
      if (level >= toleranceBytes) {
        continue;
      }
      if (size <= Math.min(currentSize - 1, currentSize * SHRINK_STEP_FACTOR)) {
        return level;
      }
    }
    return null;
  }

  public expand(): void {
    this.stepTolerance(1);
  }

  public shrink(): void {
    this.stepTolerance(-1);
  }

  public refresh(): void {
    const lastClick = this.lastClick;
    if (!lastClick || this.segmentationInProgress) {
      return;
    }
    void this.refillAtTolerance(lastClick.toleranceBytes).catch((err) => {
      growCutLog.error('OneClickSegment: refresh failed', {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private stepTolerance(direction: 1 | -1): void {
    if (this.segmentationInProgress) {
      return;
    }
    const lastClick = this.lastClick;
    if (!lastClick) {
      growCutLog.info('OneClickSegment: no click to expand/shrink yet');
      return;
    }
    const next = this.pickNextTolerance(direction);
    if (next === null) {
      growCutLog.info('OneClickSegment: no further step available', {
        direction: direction > 0 ? 'expand' : 'shrink',
        toleranceBytes: lastClick.toleranceBytes,
      });
      return;
    }
    growCutLog.info('OneClickSegment: stepping tolerance', {
      direction: direction > 0 ? 'expand' : 'shrink',
      fromToleranceBytes: lastClick.toleranceBytes,
      toToleranceBytes: next,
      predictedRegionPx: this.curveSizeAt(lastClick.expandContext, next),
    });
    const previousTolerance = lastClick.toleranceBytes;
    void this.refillAtTolerance(next).catch(async (err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message === NOT_LESION_MESSAGE && direction > 0) {
        // Expanding would break the lesion-like shape (leak into another
        // structure): restore the previous result (it passed before).
        growCutLog.info(
          'OneClickSegment: expand blocked by the lesion shape gate; restoring',
          { previousTolerance }
        );
        this.notifySegmentationError(
          'Expanding further would leak beyond a lesion-like shape; kept the previous result.'
        );
        try {
          await this.refillAtTolerance(previousTolerance);
        } catch (restoreErr) {
          growCutLog.error('OneClickSegment: restore after expand failed', {
            message:
              restoreErr instanceof Error
                ? restoreErr.message
                : String(restoreErr),
          });
        }
        return;
      }
      growCutLog.error('OneClickSegment: expand/shrink failed', { message });
    });
  }

  /**
   * Clears the previous result of the last click and refills at the given
   * tolerance — expand AND shrink are exact, not additive.
   */
  private async refillAtTolerance(toleranceBytes: number): Promise<void> {
    const lastClick = this.lastClick;
    if (!lastClick) {
      return;
    }
    const { segmentation, viewportId, renderingEngineId } = lastClick;
    const labelmapVolume = cache.getVolume(segmentation.labelmapVolumeId);
    const renderingEngine = getRenderingEngine(renderingEngineId);
    const viewport = renderingEngine?.getViewport(viewportId);
    if (!labelmapVolume || !viewport) {
      growCutLog.warn(
        'OneClickSegment: labelmap or viewport gone; cannot expand/shrink'
      );
      return;
    }

    // Clear exactly what the last run painted (voxels island removal already
    // cleared read as 0 and are skipped), then refill with the new band.
    const { voxelManager } = labelmapVolume;
    const [width, height] = labelmapVolume.dimensions;
    const pixelsPerSlice = width * height;
    const { segmentIndex } = segmentation;
    for (const [x, y, z] of lastClick.filledPoints) {
      const index = z * pixelsPerSlice + y * width + x;
      if (voxelManager.getAtIndex(index) === segmentIndex) {
        voxelManager.setAtIndex(index, 0);
      }
    }

    const range = resolveAdaptiveBandAtTolerance(
      lastClick.expandContext,
      toleranceBytes
    );

    try {
      const filledPoints = await this.fillWithRange(
        range,
        {
          segmentation,
          viewportId,
          renderingEngineId,
        },
        viewport,
        labelmapVolume,
        this.lastHoverElement ?? undefined
      );
      lastClick.toleranceBytes = toleranceBytes;
      lastClick.filledPoints = filledPoints;
      growCutLog.info('OneClickSegment: refill complete', {
        toleranceBytes,
        filledVoxels: filledPoints.length,
      });
    } catch (err) {
      // The previous result was already cleared; reflect that in the UI and
      // forget the stale points before propagating.
      lastClick.filledPoints = [];
      triggerSegmentationDataModified(segmentation.segmentationId);
      throw err;
    }
  }
}

export default OneClickSegmentTool;
