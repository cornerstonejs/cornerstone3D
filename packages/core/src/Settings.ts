/*
 * Constants
 */

const DEFAULT_SETTINGS = Symbol('DefaultSettings');
const RUNTIME_SETTINGS = Symbol('RuntimeSettings');
const OBJECT_SETTINGS_MAP = Symbol('ObjectSettingsMap');
const DICTIONARY = Symbol('Dictionary');

/**
 * Settings
 */
export default class Settings {
  constructor(base?: Settings) {
    const dictionary = Object.create(
      (base instanceof Settings && DICTIONARY in base
        ? base[DICTIONARY]
        : null) as object
    );
    Object.seal(
      Object.defineProperty(this, DICTIONARY, {
        value: dictionary,
      })
    );
  }

  set(key: string, value: unknown): boolean {
    return set(this[DICTIONARY], key, value, null);
  }

  get(key: string): unknown {
    return get(this[DICTIONARY], key);
  }

  /**
   * Unset a specific key or a set of keys within a namespace when the key ends with a dot (ASCII #46).
   * If the key is ".", all keys will be removed and this command works as a reset.
   * @param key - name The key to be unset or a namespace.
   * @returns boolean
   */
  unset(key: string): boolean {
    return unset(this[DICTIONARY], key + '');
  }

  forEach(callback: (key: string, value: unknown) => void): void {
    iterate(this[DICTIONARY], callback);
  }

  extend(): Settings {
    return new Settings(this);
  }

  /**
   * Recursively import all properties from the given plain JavaScript object.
   * This method has the opposite effect of the `dump` method.
   * @param root - The root object whose properties will
   * be imported.
   */
  import(root: Record<string, unknown>): void {
    if (isPlainObject(root)) {
      Object.keys(root).forEach((key) => {
        set(this[DICTIONARY], key, root[key], null);
      });
    }
  }

  /**
   * Build a JSON representation of the current internal state of this settings
   * object. The returned object can be safely passed to `JSON.stringify`
   * function.
   * @returns The JSON representation of the current
   * state of this settings instance
   */
  dump(): Record<string, unknown> {
    const context = {};
    iterate(this[DICTIONARY], (key, value) => {
      if (typeof value !== 'undefined') {
        deepSet(context, key, value);
      }
    });
    return context;
  }

  static assert(subject: Settings): Settings {
    return subject instanceof Settings
      ? subject
      : Settings.getRuntimeSettings();
  }

  static getDefaultSettings(subfield = null): Settings | any {
    let defaultSettings = Settings[DEFAULT_SETTINGS];
    if (!(defaultSettings instanceof Settings)) {
      defaultSettings = new Settings();
      Settings[DEFAULT_SETTINGS] = defaultSettings;
    }

    // Given subfield of 'segmentation' it will return all settings
    // that starts with segmentation.*
    if (subfield) {
      const settingObj = {};
      defaultSettings.forEach((name: string) => {
        if (name.startsWith(subfield)) {
          const setting = name.split(`${subfield}.`)[1];
          settingObj[setting] = defaultSettings.get(name);
        }
      });
      return settingObj;
    }

    return defaultSettings;
  }

  static getRuntimeSettings(): Settings {
    let runtimeSettings = Settings[RUNTIME_SETTINGS];
    if (!(runtimeSettings instanceof Settings)) {
      runtimeSettings = new Settings(Settings.getDefaultSettings());
      Settings[RUNTIME_SETTINGS] = runtimeSettings;
    }
    return runtimeSettings;
  }

  static getObjectSettings(subject: unknown, from?: unknown): Settings {
    let settings = null;
    if (subject instanceof Settings) {
      settings = subject;
    } else if (typeof subject === 'object' && subject !== null) {
      let objectSettingsMap = Settings[OBJECT_SETTINGS_MAP];
      if (!(objectSettingsMap instanceof WeakMap)) {
        objectSettingsMap = new WeakMap();
        Settings[OBJECT_SETTINGS_MAP] = objectSettingsMap;
      }
      settings = objectSettingsMap.get(subject);
      if (!(settings instanceof Settings)) {
        settings = new Settings(
          Settings.assert(Settings.getObjectSettings(from))
        );
        objectSettingsMap.set(subject, settings);
      }
    }
    return settings;
  }

  static extendRuntimeSettings(): Settings {
    return Settings.getRuntimeSettings().extend();
  }
}

/*
 * Local Helpers
 */

function unset(dictionary: Record<string, unknown>, name: string): boolean {
  if (name.endsWith('.')) {
    let deleteCount = 0;
    const namespace = name;
    const base = namespace.slice(0, -1);
    const deleteAll = base.length === 0;
    for (const key in dictionary) {
      if (
        Object.prototype.hasOwnProperty.call(dictionary, key) &&
        (deleteAll || key.startsWith(namespace) || key === base)
      ) {
        delete dictionary[key];
        ++deleteCount;
      }
    }
    return deleteCount > 0;
  }
  return delete dictionary[name];
}

function iterate(
  dictionary: Record<string, unknown>,
  callback: (key: string, value: unknown) => void
): void {
  for (const key in dictionary) {
    callback(key, dictionary[key]);
  }
}

function setAll(
  dictionary: Record<string, unknown>,
  prefix: string,
  record: Record<string, unknown>,
  references: WeakSet<Record<string, unknown>>
): boolean {
  let failCount: number;
  if (references.has(record)) {
    return set(dictionary, prefix, null, references);
  }
  references.add(record);
  failCount = 0;
  for (const field in record) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      const key = field.length === 0 ? prefix : `${prefix}.${field}`;
      if (!set(dictionary, key, record[field], references)) {
        ++failCount;
      }
    }
  }
  references.delete(record);
  return failCount === 0;
}

/**
 * Set the key-value pair on a given dictionary. If the given value is a
 * plain javascript object, every property of that object will also be set.
 * @param dictionary {Record<string, unknown>} The target dictionary
 * @param key {string} The given key
 * @param value {unknown} The given value
 * @param references {WeakSet<Record<string, unknown>>} references is a WeakSet
 *  instance used to keep track of which objects have already been iterated
 *  through preventing thus possible stack overflows caused by cyclic references
 * @returns {boolean} Returns true if every given key-value pair has been
 * successfully set
 */
function set(
  dictionary: Record<string, unknown>,
  key: string,
  value: unknown,
  references: WeakSet<Record<string, unknown>>
): boolean {
  if (isValidKey(key)) {
    if (isPlainObject(value)) {
      return setAll(
        dictionary,
        key,
        value as Record<string, unknown>,
        references instanceof WeakSet ? references : new WeakSet()
      );
    }
    dictionary[key] = value;
    return true;
  }
  return false;
}

function get(dictionary: Record<string, unknown>, key: string): unknown {
  return dictionary[key];
}

/**
 * Make sure the -provided key correctly formatted.
 * e.g.:
 *  "my.cool.property" (valid)
 *  "my.cool.property." (invalid)
 *  ".my.cool.property" (invalid)
 *  "my.cool..property" (invalid)
 * @param key {string} The property name to be used as key within the internal
 *  dictionary
 * @returns {boolean} True on success, false otherwise
 */
function isValidKey(key: string): boolean {
  let last: number, current: number, previous: number;
  if (typeof key !== 'string' || (last = key.length - 1) < 0) {
    return false;
  }
  previous = -1;
  while ((current = key.indexOf('.', previous + 1)) >= 0) {
    if (current - previous < 2 || current === last) {
      return false;
    }
    previous = current;
  }
  return true;
}

function isPlainObject(subject: unknown) {
  if (typeof subject === 'object' && subject !== null) {
    const prototype = Object.getPrototypeOf(subject);
    if (prototype === Object.prototype || prototype === null) {
      return true;
    }
  }
  return false;
}

function deepSet(context, key, value) {
  const separator = key.indexOf('.');
  if (separator >= 0) {
    const subKey = key.slice(0, separator);
    let subContext = context[subKey];
    if (typeof subContext !== 'object' || subContext === null) {
      const subContextValue = subContext;
      subContext = {};
      if (typeof subContextValue !== 'undefined') {
        subContext[''] = subContextValue;
      }
      context[subKey] = subContext;
    }
    deepSet(subContext, key.slice(separator + 1, key.length), value);
  } else {
    context[key] = value;
  }
}

/**
 * Initial Settings for the repository
 */
Settings.getDefaultSettings().set('useCursors', true);
