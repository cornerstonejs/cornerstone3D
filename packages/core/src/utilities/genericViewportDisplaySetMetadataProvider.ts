import { addProvider } from '../metaData';

const VIEWPORT_V2_DISPLAY_SET = 'genericViewportDisplaySet';

// Use a Map so reserved keys like `__proto__`/`constructor` are stored as
// ordinary keys rather than mutating the prototype or aliasing built-ins.
const state = new Map<string, unknown>();

const genericViewportDisplaySetMetadataProvider = {
  VIEWPORT_V2_DISPLAY_SET,

  add(displaySetId: string, dataSet: unknown): void {
    state.set(displaySetId, dataSet);
  },

  get(type: string, displaySetId: string): unknown {
    if (type !== VIEWPORT_V2_DISPLAY_SET) {
      return;
    }

    return state.get(displaySetId);
  },

  remove(displaySetId: string): void {
    state.delete(displaySetId);
  },

  clear(): void {
    state.clear();
  },
};

addProvider(genericViewportDisplaySetMetadataProvider.get);

export default genericViewportDisplaySetMetadataProvider;
