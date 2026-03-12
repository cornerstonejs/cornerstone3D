/**
 * Logging utilities. Uses the log exported by dcmjs so that metadata and
 * other packages share the same log hierarchy.
 */
import { log } from 'dcmjs';

export type Logger = {
  getLogger: (...categories: string[]) => Logger;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  setLevel: (level: string | number) => void;
};

/**
 * Root category for Cornerstone3D logs. Other packages (core, tools, etc.)
 * re-export this so log level is controlled from one place.
 */
export const cs3dLog = getRootLogger('cs3d');

/**
 * Metadata package log category. Use metadataLog.getLogger('tagModules') etc.
 */
export const metadataLog = cs3dLog.getLogger('metadata') as Logger;

/** Category loggers for other packages to re-export */
export const coreLog = cs3dLog.getLogger('core') as Logger;
export const toolsLog = cs3dLog.getLogger('tools') as Logger;
export const loaderLog = cs3dLog.getLogger('dicomImageLoader') as Logger;
export const aiLog = cs3dLog.getLogger('ai') as Logger;
export const examplesLog = cs3dLog.getLogger('examples') as Logger;
export const workerLog = cs3dLog.getLogger('worker') as Logger;
export const dicomConsistencyLog = log.getLogger('consistency.dicom') as Logger;
export const imageConsistencyLog = log.getLogger('consistency.image') as Logger;

/**
 * Gets a root logger for the given category name and wires up a hierarchical
 * `getLogger` method on it, similar to loglevel 2.x.
 */
export function getRootLogger(name: string): Logger {
  const logger = log.getLogger(name) as Logger;
  logger.getLogger = (...names: string[]): Logger =>
    getRootLogger(`${name}.${names.join('.')}`);
  return logger;
}

/**
 * Gets a nested logger from the root, preserving the hierarchical
 * `getLogger` behavior on the returned logger as well.
 */
export function getLogger(...name: string[]): Logger {
  return getRootLogger(name.join('.'));
}

/** Re-export dcmjs log for consumers that need the root */
export { log };
