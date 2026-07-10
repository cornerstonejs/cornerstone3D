import { logging } from '@cornerstonejs/utils';
/**
 * @deprecated Moved to utils. Import from `@cornerstonejs/utils` instead.
 *
 * Re-exports logging from @cornerstonejs/utils for backward compatibility.
 */
export const {
  getRootLogger,
  getLogger,
  cs3dLog,
  workerLog,
  coreLog,
  toolsLog,
  loaderLog,
  aiLog,
  examplesLog,
  dicomConsistencyLog,
  imageConsistencyLog,
} = logging;
export type Logger = logging.Logger;

/**
 * One-click flood fill segmentation and island-removal diagnostics. Level is
 * left to the consumer (like the other cs3d loggers); call
 * `growCutLog.setLevel('info')` in the host app to see the diagnostics.
 */
export const growCutLog = toolsLog.getLogger('growCut');
