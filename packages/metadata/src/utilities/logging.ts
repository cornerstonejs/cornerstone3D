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
  niftiVolumeLoaderLog,
  polySegLog,
  labelmapInterpolationLog,
  aiLog,
  examplesLog,
  dicomConsistencyLog,
  imageConsistencyLog,
  log,
} = logging;

/** @deprecated Worker files now use their package-specific loggers. */
export const { workerLog } = logging;

export type Logger = logging.Logger;
