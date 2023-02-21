import { registerTaskHandler } from './webWorker';
import decodeTask from './decodeTask';

// register our task
registerTaskHandler(decodeTask);

const cornerstoneWADOImageLoaderWebWorker = {
  registerTaskHandler,
};

export { registerTaskHandler };

export default cornerstoneWADOImageLoaderWebWorker;
