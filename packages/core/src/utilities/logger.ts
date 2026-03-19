import { logging } from '@cornerstonejs/metadata';
/**
 * @deprecated Moved to metadata. Import from `@cornerstonejs/metadata` instead.
 *
 * Re-exports logging from @cornerstonejs/metadata for backward compatibility.
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
