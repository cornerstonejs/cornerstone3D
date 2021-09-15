import { registerTaskHandler } from './webWorker.js';
import decodeTask from './decodeTask.js';
import { default as version } from '../version.js';

// register our task
registerTaskHandler(decodeTask);

const cornerstoneWADOImageLoaderWebWorker = {
  registerTaskHandler,
  version,
};

export { registerTaskHandler, version };

export default cornerstoneWADOImageLoaderWebWorker;
