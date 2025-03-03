import loglevelImport from 'loglevel';
import type { Logger as LogLevelLogger } from 'loglevel';

/** Get the global/shared loglevel version */
const loglevel = loglevelImport.noConflict();

type WindowLog = {
  log: unknown;
};

(window as unknown as WindowLog).log = loglevel;

export type Logger = LogLevelLogger & {
  getLogger: (...categories: string[]) => Logger;
};

/**
 * Gets a logger and adds a getLogger function to id to get child loggers.
 * This looks like the loggers in the unreleased loglevel 2.0 and is intended
 * for forwards compatibility.
 */
export function getRootLogger(name: string): Logger {
  const logger = loglevel.getLogger(name[0]) as Logger;
  logger.getLogger = (...names: string[]) => {
    return getRootLogger(`${name}.${names.join('.')}`);
  };
  return logger;
}

/** Gets a nested logger.
 * This will eventually inherit the level from the parent level, but right now
 * it doesn't
 */
export function getLogger(...name: string[]): Logger {
  return getRootLogger(name.join('.'));
}

/** Pre-setup cateogires for easy logging, by package name */
export const cs3dLog = getRootLogger('cs3d');
export const coreLog = cs3dLog.getLogger('core');
export const toolsLog = cs3dLog.getLogger('tools');
export const loaderLog = cs3dLog.getLogger('dicomImageLoader');
export const aiLog = cs3dLog.getLogger('ai');
export const examplesLog = cs3dLog.getLogger('examples');

/** Dicom issue log is for reporting inconsistencies and issues with DICOM logging */
export const dicomIssueLog = getLogger('dicom', 'issue');
