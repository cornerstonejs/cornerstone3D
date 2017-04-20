import { registerTaskHandler } from './webWorker';
import decodeTask from './decodeTask/decodeTask';

// register our task
registerTaskHandler(decodeTask);

export { registerTaskHandler };
export { default as version } from '../version';
