import { registerTaskHandler } from './webWorker';
import decodeTask from './decodeTask';

// register our task
// @ts-ignore
registerTaskHandler(decodeTask);

const cornerstoneDICOMImageLoaderWebWorker = {
  registerTaskHandler,
};

export { registerTaskHandler };

export default cornerstoneDICOMImageLoaderWebWorker;
