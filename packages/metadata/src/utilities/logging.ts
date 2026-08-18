import { logging } from '@cornerstonejs/utils';

export const {
  getRootLogger,
  getLogger,
  cs3dLog,
  metadataLog,
  coreLog,
  toolsLog,
  adaptersLog,
  loaderLog,
  polySegLog,
  labelmapInterpolationLog,
  aiLog,
  examplesLog,
  workerLog,
  dicomConsistencyLog,
  imageConsistencyLog,
  log,
} = logging;

export type Logger = logging.Logger;
