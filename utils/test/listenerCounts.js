/**
 * Counts the listeners on the Cornerstone `eventTarget` and on DOM elements,
 * by event type, for a test that looks for listeners that stay. It wraps
 * `addEventListener` and `removeEventListener` of `eventTarget` and of
 * `EventTarget.prototype` (every element) until `stop()`, and keeps the
 * listeners that are on each target as the target keeps them: one for each
 * type, function and, on an element, capture flag; a second add of the same
 * listener adds nothing. A listener added with `once` is not counted (the
 * browser removes it by itself). The listeners on `eventTarget` from before
 * the start are counted too; on an element only those added after the start
 * are seen.
 *
 * @param {object} eventTarget - The `eventTarget` of `@cornerstonejs/core`.
 * @returns `{ onEventTarget(type?), onElement(element, type?), stop() }`:
 * the counts by type (or of one type) now, and the end of the count.
 */
export function startListenerCounts(eventTarget) {
  const byTarget = new WeakMap();
  const coreTarget = eventTarget;
  const listenersOf = (target) => {
    let listeners = byTarget.get(target);

    if (!listeners) {
      listeners = new Map();
      byTarget.set(target, listeners);
    }

    return listeners;
  };
  const keyOf = (callback, options) => {
    const capture =
      typeof options === 'boolean' ? options : Boolean(options?.capture);

    return { callback, capture };
  };
  const find = (set, { callback, capture }) => {
    for (const entry of set) {
      if (entry.callback === callback && entry.capture === capture) {
        return entry;
      }
    }
  };
  const track = (target, type, callback, options) => {
    if (!callback || (typeof options === 'object' && options?.once)) {
      return;
    }

    const listeners = listenersOf(target);
    const set = listeners.get(type) ?? new Set();
    const key = keyOf(callback, options);

    if (!find(set, key)) {
      set.add(key);
    }

    listeners.set(type, set);
  };
  const untrack = (target, type, callback, options) => {
    const set = listenersOf(target).get(type);
    const entry = set && find(set, keyOf(callback, options));

    if (entry) {
      set.delete(entry);
    }
  };

  for (const [type, callbacks] of Object.entries(coreTarget.listeners ?? {})) {
    callbacks.forEach((callback) => track(coreTarget, type, callback));
  }

  const coreAdd = coreTarget.addEventListener;
  const coreRemove = coreTarget.removeEventListener;
  const domAdd = EventTarget.prototype.addEventListener;
  const domRemove = EventTarget.prototype.removeEventListener;

  coreTarget.addEventListener = function (type, callback) {
    track(coreTarget, type, callback);

    return coreAdd.call(this, type, callback);
  };
  coreTarget.removeEventListener = function (type, callback) {
    untrack(coreTarget, type, callback);

    return coreRemove.call(this, type, callback);
  };
  EventTarget.prototype.addEventListener = function (type, callback, options) {
    track(this, type, callback, options);

    return domAdd.call(this, type, callback, options);
  };
  EventTarget.prototype.removeEventListener = function (
    type,
    callback,
    options
  ) {
    untrack(this, type, callback, options);

    return domRemove.call(this, type, callback, options);
  };

  const countsOf = (target, type) => {
    const listeners = listenersOf(target);

    if (type) {
      return listeners.get(type)?.size ?? 0;
    }

    return Object.fromEntries(
      Array.from(listeners.entries())
        .filter(([, set]) => set.size)
        .map(([eventType, set]) => [eventType, set.size])
    );
  };

  return {
    onEventTarget: (type) => countsOf(coreTarget, type),
    onElement: (element, type) => countsOf(element, type),
    stop() {
      delete coreTarget.addEventListener;
      delete coreTarget.removeEventListener;

      if (coreTarget.addEventListener !== coreAdd) {
        coreTarget.addEventListener = coreAdd;
        coreTarget.removeEventListener = coreRemove;
      }

      EventTarget.prototype.addEventListener = domAdd;
      EventTarget.prototype.removeEventListener = domRemove;
    },
  };
}
