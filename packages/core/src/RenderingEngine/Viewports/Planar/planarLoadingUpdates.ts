/**
 * The time between two ticks of the clock of the updates that a volume load
 * asks for. A picture whose plane reads most frames of a loading volume (a
 * plane across the frames, a slab) changes with most deliveries, so it is
 * updated at a tick of this clock, at most once per tick, and not once per
 * delivery. The clock is shared: every layer and every pane that waits for a
 * tick updates at the same one, so the panes that a load changes draw in the
 * same animation frame, and the two layers of a fusion pane in one frame of
 * that pane. The clock paces a picture only once it shows something of the
 * load: until then each update comes at the next animation frame, so the
 * first frame that gives an empty pane something to show is drawn at once.
 */
export const PLANAR_LOADING_UPDATE_MS = 100;

/** The updates that a volume load asks a picture for. */
export type PlanarLoadingUpdates = {
  /**
   * Updates at the next animation frame, once for all the requests before
   * it. Not sooner: the voxels of a frame that a delivery announces are in
   * place by then, where an update right after the event can read the frame
   * before its image replaced the copy that it held.
   */
  now: () => void;
  /**
   * Updates at the next tick of the shared clock after the tick of the last
   * update; at the next animation frame (`now`) while no update has drawn
   * anything yet.
   */
  soon: () => void;
  /** Drops a pending update. */
  cancel: () => void;
};

/**
 * Coalesces the updates that a volume load asks a picture for: a pending
 * update takes any later request, and `soon` waits for the shared clock
 * (`PLANAR_LOADING_UPDATE_MS`) once an update has drawn something.
 *
 * @param update - What one update does; it returns false when the picture
 *   still shows nothing of the load (an overlay whose frames hold no data of
 *   its plane yet), so that the next update does not wait for the clock
 */
export function createPlanarLoadingUpdates(
  update: () => boolean | void
): PlanarLoadingUpdates {
  let frameId: number | undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastTick = -Infinity;
  let drew = false;

  const runUpdate = () => {
    frameId = undefined;
    lastTick = Math.floor(performance.now() / PLANAR_LOADING_UPDATE_MS);

    if (update() !== false) {
      drew = true;
    }
  };
  const now = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    if (frameId === undefined) {
      frameId = requestAnimationFrame(runUpdate);
    }
  };
  const soon = () => {
    if (!drew) {
      now();
      return;
    }

    if (frameId !== undefined || timeoutId !== undefined) {
      return;
    }

    const time = performance.now();
    const tick = Math.max(
      lastTick + 1,
      Math.ceil(time / PLANAR_LOADING_UPDATE_MS)
    );
    const delay = tick * PLANAR_LOADING_UPDATE_MS - time;

    if (delay <= 0) {
      now();
      return;
    }

    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      now();
    }, delay);
  };
  const cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }

    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
      frameId = undefined;
    }
  };

  return { now, soon, cancel };
}
