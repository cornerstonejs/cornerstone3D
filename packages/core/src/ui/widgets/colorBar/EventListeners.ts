enum EventListenerPhases {
  None = 0,
  Capture = 1,
  Bubble = 2,
}

type ListenersMap = Map<EventListener, EventListenerPhases>;

class TargetEventListeners {
  private _target: EventTarget;
  private _eventListeners = new Map<string, ListenersMap>();
  private _children = new Map<string, TargetEventListeners>();

  constructor(target: EventTarget) {
    this._target = target;
  }

  public get isEmpty() {
    return this._eventListeners.size === 0 && this._children.size === 0;
  }

  public addEventListener(
    type: string,
    callback: EventListener,
    options?: AddEventListenerOptions
  ) {
    const dotIndex = type.indexOf('.');
    const isNamespace = dotIndex !== -1;

    if (isNamespace) {
      const namespaceToken = type.substring(0, dotIndex);
      let childElementEventListener = this._children.get(namespaceToken);

      if (!childElementEventListener) {
        childElementEventListener = new TargetEventListeners(this._target);
        this._children.set(namespaceToken, childElementEventListener);
      }

      type = type.substring(dotIndex + 1);
      childElementEventListener.addEventListener(type, callback, options);
    } else {
      this._addEventListener(type, callback, options);
    }
  }

  /**
   * Remove an event listener with support for namespaces and optional callback
   * which makes it remove all listeners of a given type
   * @param type - Event type
   * @param callback - Event listener
   * @param options - Event options
   */
  public removeEventListener(
    type: string,
    callback?: EventListener,
    options?: EventListenerOptions
  ): void {
    const dotIndex = type.indexOf('.');
    const isNamespace = dotIndex !== -1;

    if (isNamespace) {
      const namespaceToken = type.substring(0, dotIndex);
      const childElementEventListener = this._children.get(namespaceToken);

      if (!childElementEventListener) {
        return;
      }

      type = type.substring(dotIndex + 1);
      childElementEventListener.removeEventListener(type, callback, options);

      // remove empty child objects
      if (childElementEventListener.isEmpty) {
        this._children.delete(namespaceToken);
      }
    } else {
      this._removeEventListener(type, callback, options);
    }
  }

  /**
   * Loop through all types, listeners and phases removing all of them
   */
  public dispose() {
    // Dispose all children (DFS - depth first search)
    Array.from(this._children.entries()).forEach(([namespace, child]) => {
      child.dispose();

      if (child.isEmpty) {
        this._children.delete(namespace);
      } else {
        // This scenario must never happen (safety only)
        throw new Error('Child is not empty and cannot be removed');
      }
    });

    this._unregisterAllEvents();
  }

  private _addEventListener(
    type: string,
    callback: EventListener,
    options?: AddEventListenerOptions
  ) {
    let listenersMap = this._eventListeners.get(type);

    if (!listenersMap) {
      listenersMap = new Map<EventListener, EventListenerPhases>();
      this._eventListeners.set(type, listenersMap);
    }

    const useCapture = options?.capture ?? false;
    const listenerPhase = useCapture
      ? EventListenerPhases.Capture
      : EventListenerPhases.Bubble;
    const registeredPhases =
      listenersMap.get(callback) ?? EventListenerPhases.None;

    // Bitwise operator to see if the current phase is already registered
    // because the same listener may be register twice (capturing and bubbling
    // phases)
    if (registeredPhases & listenerPhase) {
      console.warn('A listener is already registered for this phase');
      return;
    }

    // Add a new event listener or updates the existing one for the phase requested
    listenersMap.set(callback, registeredPhases | listenerPhase);

    // Add the event listener to the target
    this._target.addEventListener(type, callback, options);
  }

  private _removeEventListener(
    type: string,
    callback?: EventListener,
    options?: EventListenerOptions
  ): void {
    const useCapture = options?.capture ?? false;
    const listenerPhase = useCapture
      ? EventListenerPhases.Capture
      : EventListenerPhases.Bubble;

    const listenersMap = this._eventListeners.get(type);

    if (!listenersMap) {
      return;
    }

    // It can remove a single or all callbacks for a given namespace
    const callbacks = callback ? [callback] : Array.from(listenersMap.keys());

    callbacks.forEach((callbackItem) => {
      const registeredPhases =
        listenersMap.get(callbackItem) ?? EventListenerPhases.None;

      // Bitwise operation to see if the phase is registered
      const phaseRegistered = !!(registeredPhases & listenerPhase);

      if (!phaseRegistered) {
        return;
      }

      // Remove the event listener from the target
      this._target.removeEventListener(type, callbackItem, options);

      // Since it is enabled we can XOR it to zero the bit in that position
      //   00000011 (capture & buble) ^ 00000010 (buble) = 00000001 (capture)
      const newListenerPhase = registeredPhases ^ listenerPhase;

      // Deletes the listener if it is no more used in capturing or bubbling
      // phases or updates it otherwise
      if (newListenerPhase === EventListenerPhases.None) {
        listenersMap.delete(callbackItem);
      } else {
        listenersMap.set(callbackItem, newListenerPhase);
      }
    });

    // Deletes the event from the main map if there are no listeners anymore
    if (!listenersMap.size) {
      this._eventListeners.delete(type);
    }
  }

  private _unregisterAllListeners(type: string, listenersMap: ListenersMap) {
    // Creates a copy with Array.from() because the map mutates every
    // time an event listener is removed
    Array.from(listenersMap.entries()).forEach(([listener, eventPhases]) => {
      const startPhase = EventListenerPhases.Capture;

      // currentPhase start at 1 and shifts 1 bit to the left because
      // EventListenerPhases is a power of 2
      for (let currentPhase = startPhase; eventPhases; currentPhase <<= 1) {
        // Check if the current phase is registered
        if (!(eventPhases & currentPhase)) {
          continue;
        }

        const useCapture =
          currentPhase === EventListenerPhases.Capture ? true : false;

        // Remove the event listener for this given phase
        this.removeEventListener(type, listener, { capture: useCapture });

        // Switch the bit from the "currentPhase" from 1 to 0
        eventPhases ^= currentPhase;
      }
    });
  }

  private _unregisterAllEvents() {
    // Creates a copy with Array.from() because the map mutates every
    // time an event listener is removed
    Array.from(this._eventListeners.entries()).forEach(([type, listenersMap]) =>
      this._unregisterAllListeners(type, listenersMap)
    );
  }
}

class EventListenersManager {
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

  public dispose() {
    Array.from(this._targetsEventListeners.entries()).forEach(
      ([target, targetEventListeners]) => {
        targetEventListeners.dispose();
        this._targetsEventListeners.delete(target);
      }
    );
  }
}

export { TargetEventListeners, EventListenersManager };
