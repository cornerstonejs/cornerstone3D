/**
 * Logging utilities. Uses the log exported by dcmjs so all packages share
 * the same log hierarchy.
 *
 * A logger name has this structure:
 *
 * ```
 * cs3d.<PACKAGE>.<PATH>.<FILEORAREA>
 * ```
 *
 * - `cs3d` is the root of all Cornerstone logs.
 * - `<PACKAGE>` is the package, for example `core` or `dicomImageLoader`.
 * - `<PATH>` is the folder in the source of that package. It can have more than
 *   one part, and a file at the root of the package has no path.
 * - `<FILEORAREA>` is the file, or the area of the code when the messages come
 *   from more than one file.
 *
 * For example, `cs3d.core.RenderingEngine.StackViewport` comes from
 * `packages/core/src/RenderingEngine/StackViewport.ts`. To make this name, get
 * the logger of the package and give the other parts as separate arguments:
 *
 * ```ts
 * const log = coreLog.getLogger('RenderingEngine', 'StackViewport');
 * ```
 *
 * The applications set the levels with the loglevel interface, not with the
 * configuration of `init`. Thus the same interface controls the loggers of
 * Cornerstone, of dcmjs, and of the other components.
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
 * Root category for Cornerstone3D logs.
 */
export const cs3dLog = getRootLogger('cs3d');

/**
 * Category loggers that existing packages re-export.
 */
export const metadataLog = cs3dLog.getLogger('metadata') as Logger;
export const coreLog = cs3dLog.getLogger('core') as Logger;
export const toolsLog = cs3dLog.getLogger('tools') as Logger;
export const adaptersLog = cs3dLog.getLogger('adapters') as Logger;
export const loaderLog = cs3dLog.getLogger('dicomImageLoader') as Logger;
export const polySegLog = cs3dLog.getLogger(
  'polymorphicSegmentation'
) as Logger;
export const labelmapInterpolationLog = cs3dLog.getLogger(
  'labelmapInterpolation'
) as Logger;
export const aiLog = cs3dLog.getLogger('ai') as Logger;
export const examplesLog = cs3dLog.getLogger('examples') as Logger;
export const workerLog = cs3dLog.getLogger('worker') as Logger;
// These two loggers are not below `cs3d`, because dcmjs writes the same
// consistency messages and the two sets must stay together.
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
 * Gets a nested logger from the root, preserving hierarchical `getLogger`.
 */
export function getLogger(...name: string[]): Logger {
  return getRootLogger(name.join('.'));
}

/** Re-export dcmjs log for consumers that need the root */
export { log };
