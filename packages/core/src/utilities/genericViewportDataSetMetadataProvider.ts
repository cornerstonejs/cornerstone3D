import { addProvider } from '../metaData';

const VIEWPORT_V2_DATA_SET = 'genericViewportDataSet';

let state: Record<string, unknown> = {};

const genericViewportDataSetMetadataProvider = {
  VIEWPORT_V2_DATA_SET,

  add(dataId: string, dataSet: unknown): void {
    state[dataId] = dataSet;
  },

  get(type: string, dataId: string): unknown {
    if (type !== VIEWPORT_V2_DATA_SET) {
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

addProvider(genericViewportDataSetMetadataProvider.get);

export default genericViewportDataSetMetadataProvider;
