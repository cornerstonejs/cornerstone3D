/**
 * EventTarget - Provides the [EventTarget](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) interface
 */
class CornerstoneEventTarget implements EventTarget {
  private listeners;

  constructor() {
    this.listeners = {};
  }

  public reset() {
    this.listeners = {};
  }

  public addEventListener(type, callback) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }

    // prevent multiple callbacks from firing
    if (this.listeners[type].indexOf(callback) !== -1) {
      return;
    }

    this.listeners[type].push(callback);
  }

  public removeEventListener(type, callback) {
    if (!this.listeners[type]) {
      return;
    }

    const stack = this.listeners[type];
    const stackLength = stack.length;

    for (let i = 0; i < stackLength; i++) {
      if (stack[i] === callback) {
        stack.splice(i, 1);

        return;
      }
    }
  }

  dispatchEvent(event) {
    if (!this.listeners[event.type]) {
      //console.warn(`Skipping dispatch since there are no listeners for ${event.type}`);
      return;
    }

    const stack = this.listeners[event.type].slice();
    const stackLength = stack.length;

    for (let i = 0; i < stackLength; i++) {
      stack[i].call(this, event);
    }

    return !event.defaultPrevented;
  }
}

/**
 * EventTarget - Provides the [EventTarget](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) interface
 */
const eventTarget = new CornerstoneEventTarget();

export default eventTarget;
