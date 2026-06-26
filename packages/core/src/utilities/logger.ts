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

/** One-click flood fill and GPU grow cut diagnostics. */
export const growCutLog = toolsLog.getLogger('growCut');
growCutLog.setLevel('info');
