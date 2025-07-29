/* eslint-disable prettier/prettier */
import loglevelImport from 'loglevel';
import type { Logger as LogLevelLogger } from 'loglevel';

/** Get the global/shared loglevel version */
const loglevel = loglevelImport.noConflict();

type WindowLog = {
  log: unknown;
};

if (typeof window !== 'undefined') {
  (window as unknown as WindowLog).log = loglevel;
}

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

/**
 * Gets a nested logger.
 * This will eventually inherit the level from the parent level, but right now
 * it doesn't
 */
export function getLogger(...name: string[]): Logger {
  return getRootLogger(name.join('.'));
}

/**
 * The cs3dLog is a root category for Cornerstone3D logs.  In forms a grouping
 * for the logs underneath it, although at this point the log levels are entirely
 * either local or inherited from the root loglevel.
 * In loglevel 2.0, the default log levels will inherit from the parent logger, so
 * that using `cs3dLog.setLevel("info")` for example, will set child categories
 * to level info unless they have been otherwise specified.
 *
 * As well, the categories could be used with an externally defined appended
 * to separate various logs by source.  See dicom issue log below.
 */
export const cs3dLog = getRootLogger('cs3d');

/**
 * The core, tools etc logs are intended to form root categories for the various
 * packages to allow a particular package to be debugged or output redirected.
 *
 * The recommended usage is to create a sub-logger at the file level to log
 * data for a particular area such as:
 * ```
 *   const log = coreLog.getLogger('RenderingEngine', 'StackViewport');
 * ```
 * This usage is intended to allow hierarchical categories to turn on an entire
 * sub-directory of loggers such as `RenderingEngine` once hierarchical categories
 * have been enabled in loglevel 2.0
 */
export const coreLog = cs3dLog.getLogger('core');
export const toolsLog = cs3dLog.getLogger('tools');
export const loaderLog = cs3dLog.getLogger('dicomImageLoader');
export const aiLog = cs3dLog.getLogger('ai');

/**
 * The examples log is intended as a cross-package root logger for the examples,
 * allowing separation of logging for examples from that for other areas.
 */
export const examplesLog = cs3dLog.getLogger('examples');

/**
 * Dicom issue log is for reporting inconsistencies and issues with DICOM logging
 * This log is separated from the cs3d hierarchy to allow separation of logs
 * by use of an external appended to store inconsistencies and invalid DICOM
 * values separately.
 *
 * Levels:
 * * error - this is an issue in the data which prevents displaying at all
 * * warn - a serious issue in the data which could cause significant display
 *       issues or mismatches of data.
 * * info - an issue in the data which is handled internally or worked around such
 *       as not having patient name separated by `^` characters.
 * * debug - an issue in the data which is common and is easily managed
 */
export const dicomConsistencyLog = getLogger('consistency', 'dicom');

/** An image consistency/issue log for reporting image decompression issues */
export const imageConsistencyLog = getLogger('consistency', 'image');
