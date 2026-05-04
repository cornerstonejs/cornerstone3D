import { logging } from '@cornerstonejs/utils';

export const {
  getRootLogger,
  getLogger,
  cs3dLog,
  metadataLog,
  coreLog,
  toolsLog,
  loaderLog,
  aiLog,
  examplesLog,
  workerLog,
  dicomConsistencyLog,
  imageConsistencyLog,
  log,
} = logging;

export type Logger = logging.Logger;
