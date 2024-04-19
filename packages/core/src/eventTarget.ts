/**
 * EventTarget - Provides the [EventTarget](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) interface
 */
class CornerstoneEventTarget implements EventTarget {
  private listeners;
  private debouncedListeners;

  constructor() {
    this.listeners = {};
    this.debouncedListeners = {};
  }

  public reset() {
    this.listeners = {};
    this.debouncedListeners = {};
  }

  public addEventListenerOnce(type, callback) {
    // Create a wrapper function to encapsulate the original callback
    const onceWrapper = (event) => {
      // Remove the listener after its first invocation
      this.removeEventListener(type, onceWrapper);

      // Call the original callback
      callback.call(this, event);
    };

    // Add the wrapper as the listener
    this.addEventListener(type, onceWrapper);
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

  /**
   * Adds a debounced event listener to the event target.
   *
   * @param type - The type of the event to listen for.
   * @param callback - The callback function to be executed when the event is triggered.
   * @param delay - The delay in milliseconds before the callback is invoked after the last event.
   */
  public addEventListenerDebounced(type, callback, delay) {
    // Ensure the dictionary for the type exists
    this.debouncedListeners[type] = this.debouncedListeners[type] || {};
    const debouncedCallbacks = this.debouncedListeners[type];

    // Check if there's already a debounced version of this callback registered
    if (!debouncedCallbacks[callback]) {
      const handle = (event) => {
        // Clear any existing timeout to reset the debounce timer
        if (debouncedCallbacks[callback]) {
          clearTimeout(debouncedCallbacks[callback].timeoutId);
        }

        // Set a new timeout
        debouncedCallbacks[callback].timeoutId = setTimeout(() => {
          callback.call(this, event);
        }, delay);
      };

      // Store the handle and initial timeoutId (null initially)
      debouncedCallbacks[callback] = {
        original: callback,
        handle,
        timeoutId: null,
      };

      // Register the debounced handler
      this.addEventListener(type, handle);
    }
  }

  /**
   * Removes a debounced event listener from the event target.
   *
   * @param type - The type of the event.
   * @param callback - The callback function to be removed.
   */
  public removeEventListenerDebounced(type, callback) {
    if (
      this.debouncedListeners[type] &&
      this.debouncedListeners[type][callback]
    ) {
      const debounced = this.debouncedListeners[type][callback];
      this.removeEventListener(type, debounced.handle);
      clearTimeout(debounced.timeoutId);
      delete this.debouncedListeners[type][callback];
    }
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
      try {
        stack[i].call(this, event);
      } catch (error) {
        console.error(`error in event listener of type:  ${event.type}`, error);
      }
    }

    return !event.defaultPrevented;
  }
}

/**
 * EventTarget - Provides the [EventTarget](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget) interface
 */
const eventTarget = new CornerstoneEventTarget();

export default eventTarget;
