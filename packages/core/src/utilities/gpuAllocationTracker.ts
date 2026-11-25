import eventTarget from '../eventTarget';
import Events from '../enums/Events';
import { coreLog } from './logger';
import {
  beginPendingAllocation,
  clearPendingAllocation,
  getLastProbeTime,
  recordRenderingCapabilityFailure,
  recordRenderingCapabilitySuccess,
} from './renderingCapabilities';
import { gpuSettingsForRender } from './gpuSettingsPresets';

const log = coreLog.getLogger('utilities', 'gpuAllocationTracker');

/** An allocation of at least this size is a large allocation. */
export const LARGE_ALLOCATION_BYTES = 64 * 1024 * 1024;

/** A context loss this long after a large allocation is caused by it. */
const LOSS_WINDOW_MS = 5000;

/**
 * The time after the first render that follows a large allocation at which
 * the allocation counts as a success. It equals `LOSS_WINDOW_MS`, so one
 * allocation records a success or a loss, never both.
 */
const SETTLE_MS = LOSS_WINDOW_MS;

/**
 * A large allocation with no render in this time is abandoned: its pending
 * record is removed, and nothing is recorded.
 */
const RENDER_TIMEOUT_MS = 30000;

/**
 * A context loss this long after a probe context can come from that probe: a
 * new context near the context limit of the browser drops the oldest one.
 */
const PROBE_LOSS_WINDOW_MS = 1000;

/**
 * A large allocation. `probeAt` is the time of the last probe context when the
 * allocation happened, so a later probe shows as a different time.
 */
type LargeAllocation = {
  totalBytes: number;
  at: number;
  probeAt: number;
  /**
   * The texture or mapper that allocated, so only a draw that samples it
   * settles the allocation. `undefined` lets any draw settle it.
   */
  owner?: unknown;
};

type PendingAllocation = LargeAllocation & {
  rendered: boolean;
  timer: ReturnType<typeof setTimeout>;
};

let pending: PendingAllocation | null = null;
let lastLargeAllocation: LargeAllocation | null = null;
let listening = false;

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
    /** A normal close fires `pagehide`, and a crash does not. */
    window.addEventListener('pagehide', abandonPendingAllocation);
  }

  if (typeof document !== 'undefined') {
    /** A hidden page does not render, and a browser can reclaim its GPU. */
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
 * the page is hidden (the browser can reclaim the GPU of a hidden page).
 *
 * A loss within `PROBE_LOSS_WINDOW_MS` of a probe context that ran after the
 * allocation does not count either, because that probe can drop a viewport
 * context at the context limit of the browser. The allocation then keeps its
 * pending record. The edge probe that runs just before an allocation does not
 * exempt a loss of that allocation.
 */
function onContextLost(): void {
  const allocation =
    pending ??
    (lastLargeAllocation && Date.now() - lastLargeAllocation.at < LOSS_WINDOW_MS
      ? lastLargeAllocation
      : undefined);
  const lastProbeAt = getLastProbeTime();

  if (
    allocation &&
    lastProbeAt !== allocation.probeAt &&
    performance.now() - lastProbeAt < PROBE_LOSS_WINDOW_MS
  ) {
    log.debug(
      'a WebGL context was lost just after a probe that followed the allocation, so no limit changes'
    );

    return;
  }

  abandonPendingAllocation();

  const totalBytes = allocation?.totalBytes;

  if (!totalBytes || isHidden()) {
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
 * Nothing is recorded when no GPU settings apply: with final downsampling
 * off, on a software renderer and on CPU rendering, as on a version with no
 * GPU settings.
 *
 * @param textureBytes - the bytes of this texture
 * @param totalBytes - the texture bytes of the page, this texture included
 * @param owner - the texture or mapper that allocates; see
 * {@link noteTextureRendered}
 */
export function noteTextureAllocation({
  textureBytes,
  totalBytes,
  owner,
}: {
  textureBytes: number;
  totalBytes: number;
  owner?: unknown;
}): void {
  listen();

  if (
    textureBytes < LARGE_ALLOCATION_BYTES ||
    isHidden() ||
    !gpuSettingsForRender({ probe: false })
  ) {
    return;
  }

  /**
   * A new upload of the same owner keeps the larger total. The total of
   * another owner's allocation is already part of `totalBytes`, through the
   * ledger, while that allocation lives.
   */
  const total =
    pending && pending.owner === owner
      ? Math.max(totalBytes, pending.totalBytes)
      : totalBytes;

  if (pending) {
    clearTimeout(pending.timer);
  }

  lastLargeAllocation = {
    totalBytes: total,
    at: Date.now(),
    probeAt: getLastProbeTime(),
    owner,
  };
  pending = {
    ...lastLargeAllocation,
    rendered: false,
    timer: setTimeout(abandonPendingAllocation, RENDER_TIMEOUT_MS),
  };
  beginPendingAllocation(total);
}

/**
 * Cancels the noted allocation of this owner, for an upload that vtk.js
 * refused before it created any storage. Nothing is recorded for it, and the
 * allocation of another owner stays pending.
 *
 * @param owner - the texture or mapper that noted the allocation
 */
export function cancelTextureAllocation(owner: unknown): void {
  if (lastLargeAllocation?.owner === owner) {
    lastLargeAllocation = null;
  }

  if (pending?.owner === owner) {
    abandonPendingAllocation();
  }
}

/**
 * Notes the end of a draw of a volume mapper. The first draw after a large
 * allocation that samples its texture settles that allocation after
 * `SETTLE_MS`. A draw of another mapper does not, because the texture of the
 * allocation can still wait on its storage fence.
 *
 * @param gl - the context of the draw
 * @param textures - the textures that the draw sampled
 */
export function noteTextureRendered(
  gl?: WebGL2RenderingContext,
  textures?: readonly unknown[]
): void {
  if (!pending || pending.rendered || gl?.isContextLost?.()) {
    return;
  }

  if (pending.owner !== undefined && !textures?.includes(pending.owner)) {
    return;
  }

  clearTimeout(pending.timer);
  pending.rendered = true;
  pending.timer = setTimeout(settle, SETTLE_MS);
}
