import { MetadataModules } from '../enums';
import {
  clearTypedCacheData,
  getCacheData,
  setCacheData,
} from '../utilities/metadataProvider/cacheData';
import type { DisplaySetDescriptor } from './DisplaySetDescriptor';

const DISPLAY_SET = MetadataModules.DISPLAY_SET;

/**
 * The ids that display sets are registered under. The `DISPLAY_SET` module
 * also holds a display set under each of its image ids (the aliases that
 * `registerDisplaySetMetadata` writes); only the ids in this set are display
 * set ids.
 */
const canonicalIds = new Set<string>();

/** The alias keys that each display set id wrote, so that they go with it. */
const aliasesById = new Map<string, Set<string>>();

/**
 * The object registered under `displaySetId`, or undefined. An id whose entry
 * was cleared from the metadata cache (`utilities.clearCacheData()`) is
 * forgotten here.
 */
function readRegistered(displaySetId: string): object | undefined {
  if (!canonicalIds.has(displaySetId)) {
    return;
  }

  const value = getCacheData(DISPLAY_SET, displaySetId);

  if (value === undefined) {
    canonicalIds.delete(displaySetId);
    aliasesById.delete(displaySetId);
    return;
  }

  return value as object;
}

/**
 * Clears the alias keys of `displaySetId` that still hold `displaySet`,
 * except the keys in `keep`. A key that another display set wrote since then
 * is left as it is.
 */
function clearAliases(
  displaySetId: string,
  displaySet: object | undefined,
  keep: ReadonlySet<string> = new Set()
): void {
  for (const aliasId of aliasesById.get(displaySetId) ?? []) {
    if (
      !keep.has(aliasId) &&
      displaySet !== undefined &&
      getCacheData(DISPLAY_SET, aliasId) === displaySet
    ) {
      clearTypedCacheData(DISPLAY_SET, aliasId);
    }
  }
}

/**
 * Stores `displaySet` itself (no copy) in `MetadataModules.DISPLAY_SET` under
 * `displaySetId`, replacing what was registered under it, and under each id
 * of `aliasIds` that is not a display set id. Without `aliasIds`, a display
 * set registered again as the same object keeps its aliases, and a new
 * object drops the aliases of the old one.
 */
export function writeDisplaySet(
  displaySetId: string,
  displaySet: object,
  aliasIds?: Iterable<string>
): void {
  if (!displaySetId) {
    throw new Error('A display set is registered under a non-empty id');
  }

  const previous = readRegistered(displaySetId);
  let aliases: Set<string>;

  if (aliasIds) {
    aliases = new Set();

    for (const aliasId of aliasIds) {
      if (
        aliasId &&
        aliasId !== displaySetId &&
        readRegistered(aliasId) === undefined
      ) {
        aliases.add(aliasId);
      }
    }
  } else {
    aliases =
      previous === displaySet
        ? (aliasesById.get(displaySetId) ?? new Set())
        : new Set();
  }

  clearAliases(displaySetId, previous, aliases);
  setCacheData(DISPLAY_SET, displaySetId, displaySet);
  canonicalIds.add(displaySetId);

  for (const aliasId of aliases) {
    if (getCacheData(DISPLAY_SET, aliasId) !== displaySet) {
      setCacheData(DISPLAY_SET, aliasId, displaySet);
    }
  }

  if (aliases.size) {
    aliasesById.set(displaySetId, aliases);
  } else {
    aliasesById.delete(displaySetId);
  }
}

/**
 * The display sets that viewports mount, kept in the `DISPLAY_SET` module of
 * the metadata cache: `metaData.getTyped(MetadataModules.DISPLAY_SET, id)`
 * reads the same object. `viewport.setDisplaySets({ displaySetId })` and
 * `viewport.addDisplaySet(displaySetId)` load the descriptor added here
 * under that id; the viewport family and the fields of the descriptor
 * decide how (see `DisplaySetDescriptor`).
 *
 * A registration lives until it is removed, until `clear()`, or until the
 * metadata cache is cleared (`utilities.clearCacheData()`, which the DICOM
 * image loader's `init` also calls). `cache.purgeCache()` of
 * `@cornerstonejs/core` does not clear it.
 */
export const displaySetRegistry = {
  /**
   * Registers `descriptor` under `displaySetId`. The registry keeps the
   * object itself, not a copy, and does not change it; a second add under
   * the same id replaces the first. Throws when the descriptor has a
   * `displaySetId` that is not `displaySetId`.
   */
  add(displaySetId: string, descriptor: DisplaySetDescriptor): void {
    if (
      descriptor.displaySetId !== undefined &&
      descriptor.displaySetId !== displaySetId
    ) {
      throw new Error(
        `displaySetRegistry.add: the descriptor has the displaySetId ` +
          `"${descriptor.displaySetId}", which is not the id "${displaySetId}" ` +
          `that it is added under`
      );
    }

    writeDisplaySet(displaySetId, descriptor);
  },

  /**
   * The descriptor registered under the id, or undefined. An image id under
   * which `registerDisplaySetMetadata` stored a display set is not a display
   * set id: it gives undefined.
   */
  get(displaySetId: string): DisplaySetDescriptor | undefined {
    return readRegistered(displaySetId) as DisplaySetDescriptor | undefined;
  },

  /** Whether a descriptor is registered under the id. */
  has(displaySetId: string): boolean {
    return readRegistered(displaySetId) !== undefined;
  },

  /**
   * Removes the descriptor of the id and the image id aliases that it
   * wrote. An id that is not a display set id removes nothing.
   */
  remove(displaySetId: string): void {
    const displaySet = readRegistered(displaySetId);

    if (displaySet === undefined) {
      return;
    }

    clearAliases(displaySetId, displaySet);
    clearTypedCacheData(DISPLAY_SET, displaySetId);
    canonicalIds.delete(displaySetId);
    aliasesById.delete(displaySetId);
  },

  /**
   * Removes every registered descriptor and its aliases. Entries of the
   * `DISPLAY_SET` module that were not written through the registry stay.
   */
  clear(): void {
    for (const displaySetId of [...canonicalIds]) {
      displaySetRegistry.remove(displaySetId);
    }
  },
};
