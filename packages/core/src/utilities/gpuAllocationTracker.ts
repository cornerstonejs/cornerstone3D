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

const log = coreLog.getLogger('utilities', 'gpuAllocationTracker');

/** An allocation of at least this size is a large allocation. */
export const LARGE_ALLOCATION_BYTES = 64 * 1024 * 1024;

/** A context loss this long after a large allocation is caused by it. */
const LOSS_WINDOW_MS = 5000;

/**
 * The time after the first render that follows a large allocation at which
 * the allocation counts as a success. It equals `LOSS_WINDOW_MS`, so one
 * allocation records a success or a loss, never both: a success would remove
 * the failure of the same total, and no ceiling could form.
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
type LargeAllocation = { totalBytes: number; at: number; probeAt: number };

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
 * @param textureBytes - the bytes of this texture
 * @param totalBytes - the texture bytes of the page, this texture included
 */
export function noteTextureAllocation({
  textureBytes,
  totalBytes,
}: {
  textureBytes: number;
  totalBytes: number;
}): void {
  listen();

  if (textureBytes < LARGE_ALLOCATION_BYTES || isHidden()) {
    return;
  }

  const total = Math.max(totalBytes, pending?.totalBytes ?? 0);

  if (pending) {
    clearTimeout(pending.timer);
  }

  lastLargeAllocation = {
    totalBytes: total,
    at: Date.now(),
    probeAt: getLastProbeTime(),
  };
  pending = {
    ...lastLargeAllocation,
    rendered: false,
    timer: setTimeout(abandonPendingAllocation, RENDER_TIMEOUT_MS),
  };
  beginPendingAllocation(total);
}

/**
 * Notes the end of a render of a volume mapper. The first render after a
 * large allocation settles that allocation after `SETTLE_MS`.
 *
 * @param gl - the context of the render
 */
export function noteTextureRendered(gl?: WebGL2RenderingContext): void {
  if (!pending || pending.rendered || gl?.isContextLost?.()) {
    return;
  }

  clearTimeout(pending.timer);
  pending.rendered = true;
  pending.timer = setTimeout(settle, SETTLE_MS);
}
