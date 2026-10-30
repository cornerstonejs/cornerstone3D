/**
 * The storage that keeps the record of the rendering capabilities.
 *
 * Every read and write of that record goes through this interface, so a later
 * change can add a file store for a server render. A store must not throw: a
 * missing or failing store acts as an empty one.
 */
export interface CapabilityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Every key that starts with `prefix`. */
  keys(prefix: string): string[];
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    // A browser can throw on the access itself, for example with blocked
    // site data.
    return undefined;
  }
}

/**
 * The default store, which is `localStorage`. Each member catches the errors of
 * a privacy mode, a full quota or blocked site data.
 */
export const localCapabilityStorage: CapabilityStorage = {
  getItem: (key) => {
    try {
      return browserStorage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      browserStorage()?.setItem(key, value);
    } catch {
      // Without a store, each load probes again.
    }
  },
  removeItem: (key) => {
    try {
      browserStorage()?.removeItem(key);
    } catch {
      // Nothing to remove.
    }
  },
  keys: (prefix) => {
    const found: string[] = [];

    try {
      const storage = browserStorage();

      for (let index = 0; index < (storage?.length ?? 0); index++) {
        const key = storage.key(index);

        if (key?.startsWith(prefix)) {
          found.push(key);
        }
      }
    } catch {
      // An empty list.
    }

    return found;
  },
};

let activeStorage: CapabilityStorage = localCapabilityStorage;

/** The store that the record of the rendering capabilities uses now. */
export function getCapabilityStorage(): CapabilityStorage {
  return activeStorage;
}

/**
 * Replaces the store of the record. `undefined` returns to `localStorage`. A
 * test or a server render states its own store here.
 */
export function setCapabilityStorage(storage?: CapabilityStorage): void {
  activeStorage = storage ?? localCapabilityStorage;
}
