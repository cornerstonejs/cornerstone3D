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
