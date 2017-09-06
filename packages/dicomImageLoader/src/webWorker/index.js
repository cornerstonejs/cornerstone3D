import { registerTaskHandler } from './webWorker.js';
import decodeTask from './decodeTask/decodeTask.js';

// register our task
registerTaskHandler(decodeTask);

export { registerTaskHandler };
export { default as version } from '../version.js';
