import eventTarget from '../eventTarget';
import Events from '../enums/Events';
import { coreLog } from './logger';
import {
  beginPendingAllocation,
  clearPendingAllocation,
  getEdgeVerifiedAtStart,
  recordRenderingCapabilityFailure,
  recordRenderingCapabilitySuccess,
} from './renderingCapabilities';

const log = coreLog.getLogger('utilities', 'gpuAllocationTracker');

/** An allocation of at least this size is a large allocation. */
export const LARGE_ALLOCATION_BYTES = 64 * 1024 * 1024;

/**
 * The time after a large allocation at which the allocation and its first
 * render count as a success. The render of the allocation runs in the same
 * frame, so this also covers that render.
 */
const SETTLE_MS = 2000;

/** A context loss this long after a large allocation is caused by it. */
const LOSS_WINDOW_MS = 5000;

/** What an edge render check receives. */
export type EdgeRenderCheckContext = {
  /** The edge of the texture, which is above the edge verified at start. */
  edge: number;
  volumeId?: string;
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
 * texture that has no data yet, or a window that saturates every value.
 */
export function setEdgeRenderCheck(check?: EdgeRenderCheck): void {
  edgeRenderCheck = check;
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
    // A hidden page does not render, so its pending record would stay, and a
    // new tab would read it as a crash.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        abandonPendingAllocation();
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

function settle(gl?: WebGL2RenderingContext): void {
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

  if (!pending) {
    return;
  }

  const { totalBytes } = pending;

  pending = null;
  clearPendingAllocation();
  recordRenderingCapabilitySuccess('textureBytes', totalBytes);
  recordRenderingCapabilitySuccess('gpuBytes', totalBytes);
}

function onContextLost(): void {
  const recent =
    lastLargeAllocation && Date.now() - lastLargeAllocation.at < LOSS_WINDOW_MS
      ? lastLargeAllocation.totalBytes
      : undefined;
  const totalBytes = pending?.totalBytes ?? recent;

  abandonPendingAllocation();

  if (!totalBytes) {
    log.debug(
      'a WebGL context was lost with no large allocation shortly before it, so no limit changes'
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
 * A large allocation writes a pending record, so a crash during the
 * allocation or its first render is found at the next start. The record is
 * removed, and the total counts as a success, when the allocation and its
 * first render settle. A context loss before that, or shortly after, records
 * the total as lost.
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
  gl,
}: {
  textureBytes: number;
  totalBytes: number;
  maxEdge: number;
  volumeId?: string;
  gl?: WebGL2RenderingContext;
}): void {
  listen();

  const verified = getEdgeVerifiedAtStart();
  const checkEdge = Boolean(verified && maxEdge > verified);

  if (checkEdge) {
    edgeChecks.push({ edge: maxEdge, volumeId });
  }

  if (textureBytes < LARGE_ALLOCATION_BYTES) {
    if (checkEdge && !pending) {
      setTimeout(() => settle(gl), SETTLE_MS);
    }

    return;
  }

  const total = Math.max(totalBytes, pending?.totalBytes ?? 0);

  if (pending) {
    clearTimeout(pending.timer);
  }

  pending = {
    totalBytes: total,
    timer: setTimeout(() => settle(gl), SETTLE_MS),
  };
  lastLargeAllocation = { totalBytes: total, at: Date.now() };
  beginPendingAllocation(total);
}
