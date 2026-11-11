import { createStore } from 'zustand/vanilla';
import type { IDisplaySet } from './IDisplaySet';

export interface DisplaySetStoreState {
  /** The display sets, keyed by the host's unique id, in insertion order. */
  displaySets: Map<string, IDisplaySet>;
  /** Adds or replaces the display set under `uid`. */
  setDisplaySet: (uid: string, displaySet: IDisplaySet) => void;
  /** Removes a display set; returns false when `uid` was not in the store. */
  removeDisplaySet: (uid: string) => boolean;
  /** Removes every display set. */
  clear: () => void;
}

/**
 * The display sets of the application, as a vanilla zustand store (no React).
 *
 * The key is the host's unique id of the display set (in OHIF, the
 * `displaySetInstanceUID`), not `displaySetId`, which can change on a re-split.
 * Read with `displaySetStore.getState().displaySets`, or with
 * `metaData.getTyped(MetadataModules.DISPLAY_SET, uid)` once
 * `registerDisplaySetProviders()` has run. Each write replaces the `Map`, so
 * `subscribe` and selectors see every change.
 *
 * `clearCacheData()` does not clear this store: the owner of the display sets
 * calls `clear()`, for example when a viewer mode exits.
 */
export const displaySetStore = createStore<DisplaySetStoreState>()(
  (set, get) => ({
    displaySets: new Map(),
    setDisplaySet: (uid, displaySet) =>
      set((state) => ({
        displaySets: new Map(state.displaySets).set(uid, displaySet),
      })),
    removeDisplaySet: (uid) => {
      const { displaySets } = get();
      if (!displaySets.has(uid)) {
        return false;
      }
      const next = new Map(displaySets);
      next.delete(uid);
      set({ displaySets: next });
      return true;
    },
    clear: () => set({ displaySets: new Map() }),
  })
);
