import { addProvider } from '../metaData';

const VIEWPORT_V2_DISPLAY_SET = 'genericViewportDisplaySet';

let state: Record<string, unknown> = {};

const genericViewportDisplaySetMetadataProvider = {
  VIEWPORT_V2_DISPLAY_SET,

  add(dataId: string, dataSet: unknown): void {
    state[dataId] = dataSet;
  },

  get(type: string, dataId: string): unknown {
    if (type !== VIEWPORT_V2_DISPLAY_SET) {
      return;
    }

    return state[dataId];
  },

  remove(dataId: string): void {
    delete state[dataId];
  },

  clear(): void {
    state = {};
  },
};

addProvider(genericViewportDisplaySetMetadataProvider.get);

export default genericViewportDisplaySetMetadataProvider;
