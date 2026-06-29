import { addProvider } from '../metaData';

const VIEWPORT_V2_DISPLAY_SET = 'genericViewportDisplaySet';

let state: Record<string, unknown> = {};

const genericViewportDisplaySetMetadataProvider = {
  VIEWPORT_V2_DISPLAY_SET,

  add(displaySetId: string, dataSet: unknown): void {
    state[displaySetId] = dataSet;
  },

  get(type: string, displaySetId: string): unknown {
    if (type !== VIEWPORT_V2_DISPLAY_SET) {
      return;
    }

    return state[displaySetId];
  },

  remove(displaySetId: string): void {
    delete state[displaySetId];
  },

  clear(): void {
    state = {};
  },
};

addProvider(genericViewportDisplaySetMetadataProvider.get);

export default genericViewportDisplaySetMetadataProvider;
