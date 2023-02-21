import { registerTaskHandler } from './webWorker';
import decodeTask from './decodeTask';

// register our task
// @ts-ignore
registerTaskHandler(decodeTask);

const dicomImageLoaderWebWorker = {
  registerTaskHandler,
};

export { registerTaskHandler };

export default dicomImageLoaderWebWorker;
