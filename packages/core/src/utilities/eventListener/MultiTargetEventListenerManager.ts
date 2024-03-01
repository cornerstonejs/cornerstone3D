import TargetEventListeners from './TargetEventListeners';

/**
 * MultiTargetEventListenerManager allows you to add event listeners to multiple
 * HTML elements (targets) with support for event types with namespace,
 * allow removing events without having to pass a callback and makes it possible
 * to remove all event lsiteners from all HTML elements in a much simpler avoiding
 * leaving listeners behind which would result in memory leaks.
 *
 * @example
 * Adding and removing event listeners
 * ```javascript
 *   const eventListenerManager = new MultiTargetEventListenerManager()
 *   const element1 = document.getElementById('foo');
 *   const element2 = document.getElementById('bar');
 *   const mouseoverCallback = () => { };
 *   const mouseoutCallback = () => { };
 *   const dragCallback = () => { };
 *
 *   eventListenerManager.addEventListener(element1, 'mouseover', mouseoverCallback);
 *   eventListenerManager.addEventListener(element1, 'mouseout', mouseoutCallback);
 *
 *   eventListenerManager.addEventListener(element2, 'voi.mousemove', dragCallback);
 *   eventListenerManager.addEventListener(element2, 'voi.drag', dragCallback);
 *   eventListenerManager.addEventListener(element2, 'voi.mouseup', () => {
 *     // do not need to store a reference of this function
 *   }));
 *
 *   // Removes a specific event listener from element2
 *   eventListenerManager.removeEventListener(element2, 'voi.mousemove', dragCallback)
 *
 *   // Removes all "mouseup" event listeners added to "voi" namespace on element2
 *   eventListenerManager.removeEventListener(element2, 'voi.mouseup')
 *
 *   // Removes all event listeners added to element1 and element2
 *   eventListenerManager.reset();
 * ```
 */
class MultiTargetEventListenerManager {
  private _targetsEventListeners = new Map<EventTarget, TargetEventListeners>();

  public addEventListener(
    target: EventTarget,
    type: string,
    callback: EventListener,
    options?: AddEventListenerOptions
  ) {
    let eventListeners = this._targetsEventListeners.get(target);

    if (!eventListeners) {
      eventListeners = new TargetEventListeners(target);
      this._targetsEventListeners.set(target, eventListeners);
    }

    eventListeners.addEventListener(type, callback, options);
  }

  public removeEventListener(
    target: EventTarget,
    type: string,
    callback?: EventListener,
    options?: EventListenerOptions
  ) {
    const eventListeners = this._targetsEventListeners.get(target);

    if (!eventListeners) {
      return;
    }

    eventListeners.removeEventListener(type, callback, options);

    if (eventListeners.isEmpty) {
      this._targetsEventListeners.delete(target);
    }
  }

  public reset() {
    Array.from(this._targetsEventListeners.entries()).forEach(
      ([target, targetEventListeners]) => {
        targetEventListeners.reset();
        this._targetsEventListeners.delete(target);
      }
    );
  }
}

export {
  MultiTargetEventListenerManager as default,
  MultiTargetEventListenerManager,
};
