/**
 * Calls back at the next idle period of the main thread, or after the
 * current task where the browser has no `requestIdleCallback`.
 */
export default function whenIdle(callback: () => void): void {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(callback);
  } else {
    setTimeout(callback, 0);
  }
}

/** The part of the Prioritized Task Scheduling API that `inBackgroundTask` uses. */
type BackgroundTaskScheduler = {
  postTask: (
    callback: () => void,
    options: { priority: 'background'; signal: AbortSignal }
  ) => Promise<unknown>;
};

/**
 * Calls back in a task of background priority (`scheduler.postTask`), which
 * the browser runs when no task of a higher priority waits, such as the
 * responses and the decoded frames of a load; at the next idle period where
 * the browser has no such scheduler (see {@link whenIdle}).
 *
 * @returns A function that cancels the call when it has not run yet
 */
export function inBackgroundTask(callback: () => void): () => void {
  const scheduler = (globalThis as { scheduler?: BackgroundTaskScheduler })
    .scheduler;
  let cancelled = false;

  if (typeof scheduler?.postTask === 'function') {
    const controller = new AbortController();

    scheduler
      .postTask(callback, {
        priority: 'background',
        signal: controller.signal,
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          throw error;
        }
      });

    return () => controller.abort();
  }

  whenIdle(() => {
    if (!cancelled) {
      callback();
    }
  });

  return () => {
    cancelled = true;
  };
}
