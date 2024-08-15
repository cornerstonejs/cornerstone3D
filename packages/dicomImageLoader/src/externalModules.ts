/* eslint import/extensions:0 */
import { getOptions } from './imageLoader/internal';
import registerLoaders from './imageLoader/registerLoaders';

let cornerstone;
let dicomParser;

const workerFn = () => {
  const instance = new Worker(
    new URL('./decodeImageFrameWorker.js', import.meta.url),
    { type: 'module' }
  );
  return instance;
};

const external = {
  set cornerstone(cs) {
    cornerstone = cs;

    registerLoaders(cornerstone);

    const options = getOptions();

    const workerManager = external.cornerstone.getWebWorkerManager();
    workerManager.registerWorker('dicomImageLoader', workerFn, {
      maxWorkerInstances: options.maxWebWorkers || 1,
    });
  },
  get cornerstone() {
    if (!cornerstone) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cornerstone = window && (window as any).cornerstone;

      if (!cornerstone) {
        throw new Error(
          'cornerstoneDICOMImageLoader requires a copy of Cornerstone to work properly. Please add cornerstoneDICOMImageLoader.external.cornerstone = cornerstone; to your application.'
        );
      }

      registerLoaders(cornerstone);
    }

    return cornerstone;
  },
  set dicomParser(dp) {
    dicomParser = dp;
  },
  get dicomParser() {
    if (!dicomParser) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (window && (window as any).dicomParser) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dicomParser = (window as any).dicomParser;
      } else {
        throw new Error(
          'cornerstoneDICOMImageLoader requires a copy of dicomParser to work properly. Please add cornerstoneDICOMImageLoader.external.dicomParser = dicomParser; to your application.'
        );
      }
    }

    return dicomParser;
  },
};

export default external;
