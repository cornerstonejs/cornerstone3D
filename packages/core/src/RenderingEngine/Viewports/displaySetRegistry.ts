import type { DisplaySetDescriptor } from '../../types/DisplaySetDescriptor';

// Use a Map so reserved keys like `__proto__`/`constructor` are stored as
// ordinary keys rather than mutating the prototype or aliasing built-ins.
const state = new Map<string, DisplaySetDescriptor>();

/**
 * The display sets that viewports mount. `viewport.setDisplaySets({
 * displaySetId })` and `viewport.addDisplaySet(displaySetId)` load the
 * descriptor added here under that id; the viewport family and the fields
 * of the descriptor decide how (see `DisplaySetDescriptor`).
 */
const displaySetRegistry = {
  /**
   * Registers the descriptor of a display set under its id. A second add
   * under the same id replaces the first.
   */
  add(displaySetId: string, descriptor: DisplaySetDescriptor): void {
    state.set(displaySetId, descriptor);
  },

  /** The descriptor registered under the id, or undefined. */
  get(displaySetId: string): DisplaySetDescriptor | undefined {
    return state.get(displaySetId);
  },

  /** Whether a descriptor is registered under the id. */
  has(displaySetId: string): boolean {
    return state.has(displaySetId);
  },

  /** Removes the descriptor of the id. */
  remove(displaySetId: string): void {
    state.delete(displaySetId);
  },

  /** Removes every descriptor. */
  clear(): void {
    state.clear();
  },
};

export default displaySetRegistry;
