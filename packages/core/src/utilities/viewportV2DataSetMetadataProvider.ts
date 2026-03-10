import { addProvider } from '../metaData';

const VIEWPORT_V2_DATA_SET = 'viewportV2DataSet';

let state: Record<string, unknown> = {};

const viewportV2DataSetMetadataProvider = {
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

addProvider(viewportV2DataSetMetadataProvider.get);

export default viewportV2DataSetMetadataProvider;
