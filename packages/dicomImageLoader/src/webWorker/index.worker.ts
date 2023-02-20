import { registerTaskHandler } from './webWorker.js';
import decodeTask from './decodeTask.js';

// register our task
registerTaskHandler(decodeTask);

const cornerstoneWADOImageLoaderWebWorker = {
  registerTaskHandler,
};

export { registerTaskHandler };

export default cornerstoneWADOImageLoaderWebWorker;
