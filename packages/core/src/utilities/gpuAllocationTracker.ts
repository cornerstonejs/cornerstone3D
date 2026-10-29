import eventTarget from '../eventTarget';
import Events from '../enums/Events';
import { coreLog } from './logger';
import {
  beginPendingAllocation,
  clearPendingAllocation,
  getEdgeVerifiedAtStart,
  getLastProbeTime,
  recordRenderingCapabilityFailure,
  recordRenderingCapabilitySuccess,
} from './renderingCapabilities';

const log = coreLog.getLogger('utilities', 'gpuAllocationTracker');

/** An allocation of at least this size is a large allocation. */
export const LARGE_ALLOCATION_BYTES = 64 * 1024 * 1024;

/**
 * The time after the first render that follows a large allocation at which
 * the allocation counts as a success. A context loss that the render causes
 * arrives in this time.
 */
const SETTLE_MS = 500;

/**
 * A large allocation with no render in this time is abandoned: its pending
 * record is removed, and nothing is recorded.
 */
const RENDER_TIMEOUT_MS = 30000;

/** A context loss this long after a large allocation is caused by it. */
const LOSS_WINDOW_MS = 5000;

/**
 * A context loss this long after a probe context can come from that probe: a
 * new context near the context limit of the browser drops the oldest one.
 */
const PROBE_LOSS_WINDOW_MS = 1000;

/** What an edge render check receives. */
export type EdgeRenderCheckContext = {
  /** The edge of the texture, which is above the edge verified at start. */
  edge: number;
  volumeId?: string;
  /** The context of the render that drew the texture. */
  gl?: WebGL2RenderingContext;
};

/**
 * The second check of the texture edge, after the first render of a texture
 * with an edge above the edge verified at the start of the page. It returns
 * false for a render that failed (a uniform gray), and `undefined` when it
 * cannot decide.
 */
export type EdgeRenderCheck = (
  context: EdgeRenderCheckContext
) => boolean | undefined;

type PendingAllocation = {
  totalBytes: number;
  rendered: boolean;
  timer: ReturnType<typeof setTimeout>;
};

let pending: PendingAllocation | null = null;
let lastLargeAllocation: { totalBytes: number; at: number } | null = null;
let edgeChecks: EdgeRenderCheckContext[] = [];
let edgeRenderCheck: EdgeRenderCheck | undefined;
let listening = false;

/**
 * States the second check of the texture edge. No check applies by default,
 * because a uniform gray can also be a correct image: uniform source data, a
 * texture that has no data yet, or a window that saturates every value. A
 * check that returns false records the edge as failed, with the edge verified
 * at the start of the page as the reliable edge.
 */
export function setEdgeRenderCheck(check?: EdgeRenderCheck): void {
  edgeRenderCheck = check;
}

function isHidden(): boolean {
  return (
    typeof document !== 'undefined' && document.visibilityState === 'hidden'
  );
}

function listen(): void {
  if (listening) {
    return;
  }

  listening = true;
  eventTarget.addEventListener(Events.WEBGL_CONTEXT_LOST, onContextLost);

  if (typeof window !== 'undefined') {
    // A normal close fires `pagehide`, and a crash does not.
    window.addEventListener('pagehide', abandonPendingAllocation);
  }

  if (typeof document !== 'undefined') {
    // A hidden page does not render, and a browser can reclaim its GPU.
    document.addEventListener('visibilitychange', () => {
      if (isHidden()) {
        abandonPendingAllocation();
        lastLargeAllocation = null;
      }
    });
  }
}

/** Removes the pending record, and records nothing. */
function abandonPendingAllocation(): void {
  if (!pending) {
    return;
  }

  clearTimeout(pending.timer);
  pending = null;
  clearPendingAllocation();
}

function runEdgeChecks(gl?: WebGL2RenderingContext): void {
  const checks = edgeChecks;
  edgeChecks = [];

  for (const check of checks) {
    if (edgeRenderCheck?.({ ...check, gl }) === false) {
      recordRenderingCapabilityFailure(
        'edge',
        check.edge,
        getEdgeVerifiedAtStart()
      );
      log.warn(
        `the texture of the edge ${check.edge} rendered a uniform gray, but the probe passed that edge; the edge is recorded as failed`
      );
    }
  }
}

function settle(): void {
  if (!pending) {
    return;
  }

  const { totalBytes } = pending;

  pending = null;
  clearPendingAllocation();
  recordRenderingCapabilitySuccess('textureBytes', totalBytes);
  recordRenderingCapabilitySuccess('gpuBytes', totalBytes);
}

/**
 * Attributes a context loss to a large allocation.
 *
 * A loss counts when it arrives while a large allocation waits for its render,
 * or within `LOSS_WINDOW_MS` of a large allocation. A loss does not count when
 * the page is hidden (the browser can reclaim the GPU of a hidden page), or
 * within `PROBE_LOSS_WINDOW_MS` of a probe context (the probe can drop a
 * viewport context at the context limit of the browser).
 */
function onContextLost(): void {
  const recent =
    lastLargeAllocation && Date.now() - lastLargeAllocation.at < LOSS_WINDOW_MS
      ? lastLargeAllocation.totalBytes
      : undefined;
  const totalBytes = pending?.totalBytes ?? recent;

  abandonPendingAllocation();

  if (
    !totalBytes ||
    isHidden() ||
    performance.now() - getLastProbeTime() < PROBE_LOSS_WINDOW_MS
  ) {
    log.debug(
      'a WebGL context was lost, but not in a large allocation of a visible page, so no limit changes'
    );

    return;
  }

  recordRenderingCapabilityFailure('textureBytes', totalBytes);
  log.warn(
    `a WebGL context was lost after a texture allocation, with ${totalBytes} texture bytes in use; the total is recorded as lost`
  );
}

/**
 * Notes the allocation of one texture, just before the allocation.
 *
 * A large allocation of a visible page writes a pending record, so a crash
 * during the allocation or its first render is found at the next start. The
 * first render after the allocation (see {@link noteTextureRendered}) settles
 * it: the pending record is removed, and the total counts as a success. A
 * context loss before that, or shortly after, records the total as lost (see
 * `onContextLost`). A hidden page writes no pending record, because its
 * timers and its renders can wait for minutes.
 *
 * A texture with an edge above the edge verified at the start of the page is
 * queued for the edge render check (see {@link setEdgeRenderCheck}).
 *
 * @param textureBytes - the bytes of this texture
 * @param totalBytes - the texture bytes of the page, this texture included
 * @param maxEdge - the largest edge of this texture
 */
export function noteTextureAllocation({
  textureBytes,
  totalBytes,
  maxEdge,
  volumeId,
}: {
  textureBytes: number;
  totalBytes: number;
  maxEdge: number;
  volumeId?: string;
}): void {
  listen();

  const verified = getEdgeVerifiedAtStart();

  if (verified && maxEdge > verified) {
    edgeChecks.push({ edge: maxEdge, volumeId });
  }

  if (textureBytes < LARGE_ALLOCATION_BYTES || isHidden()) {
    return;
  }

  const total = Math.max(totalBytes, pending?.totalBytes ?? 0);

  if (pending) {
    clearTimeout(pending.timer);
  }

  pending = {
    totalBytes: total,
    rendered: false,
    timer: setTimeout(abandonPendingAllocation, RENDER_TIMEOUT_MS),
  };
  lastLargeAllocation = { totalBytes: total, at: Date.now() };
  beginPendingAllocation(total);
}

/**
 * Notes the end of a render of a volume mapper. The first render after a
 * large allocation settles that allocation after `SETTLE_MS`, and runs the
 * edge render checks.
 *
 * @param gl - the context of the render
 */
export function noteTextureRendered(gl?: WebGL2RenderingContext): void {
  if (edgeChecks.length) {
    runEdgeChecks(gl);
  }

  if (!pending || pending.rendered || gl?.isContextLost?.()) {
    return;
  }

  clearTimeout(pending.timer);
  pending.rendered = true;
  pending.timer = setTimeout(settle, SETTLE_MS);
}
