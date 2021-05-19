/*
 * Constants
 */
const DEFAULT_SETTINGS = Symbol('DefaultSettings');
const RUNTIME_SETTINGS = Symbol('RuntimeSettings');
const OBJECT_SETTINGS_MAP = Symbol('ObjectSettingsMap');
const DICTIONARY = Symbol('Dictionary');
/**
 * @class Settings
 */
export default class Settings {
    constructor(base) {
        const dictionary = Object.create(base instanceof Settings && DICTIONARY in base ? base[DICTIONARY] : null);
        Object.seal(Object.defineProperty(this, DICTIONARY, {
            value: dictionary,
        }));
    }
    set(key, value) {
        return set(this[DICTIONARY], key, value, null);
    }
    get(key) {
        return get(this[DICTIONARY], key);
    }
    /**
     * Unset a specific key or a set of keys within a namespace when the key ends with a dot (ASCII #46).
     * If the key is ".", all keys will be removed and this command works as a reset.
     * @param {object} dictionary The dictionary on which to unset a key.
     * @param {string} name The key to be unset or a namespace.
     * @returns boolean
     */
    unset(key) {
        return unset(this[DICTIONARY], key + '');
    }
    forEach(callback) {
        iterate(this[DICTIONARY], callback);
    }
    extend() {
        return new Settings(this);
    }
    static assert(subject) {
        return subject instanceof Settings ? subject : Settings.getRuntimeSettings();
    }
    static getDefaultSettings() {
        let defaultSettings = Settings[DEFAULT_SETTINGS];
        if (!(defaultSettings instanceof Settings)) {
            defaultSettings = new Settings();
            Settings[DEFAULT_SETTINGS] = defaultSettings;
        }
        return defaultSettings;
    }
    static getRuntimeSettings() {
        let runtimeSettings = Settings[RUNTIME_SETTINGS];
        if (!(runtimeSettings instanceof Settings)) {
            runtimeSettings = new Settings(Settings.getDefaultSettings());
            Settings[RUNTIME_SETTINGS] = runtimeSettings;
        }
        return runtimeSettings;
    }
    static getObjectSettings(subject, from) {
        let settings = null;
        if (subject instanceof Settings) {
            settings = subject;
        }
        else if (typeof subject === 'object' && subject !== null) {
            let objectSettingsMap = Settings[OBJECT_SETTINGS_MAP];
            if (!(objectSettingsMap instanceof WeakMap)) {
                objectSettingsMap = new WeakMap();
                Settings[OBJECT_SETTINGS_MAP] = objectSettingsMap;
            }
            settings = objectSettingsMap.get(subject);
            if (!(settings instanceof Settings)) {
                settings = new Settings(Settings.assert(Settings.getObjectSettings(from)));
                objectSettingsMap.set(subject, settings);
            }
        }
        return settings;
    }
    static extendRuntimeSettings() {
        return Settings.getRuntimeSettings().extend();
    }
}
/*
 * Local Helpers
 */
function unset(dictionary, name) {
    if (name.endsWith('.')) {
        let deleteCount = 0;
        const namespace = name;
        const base = namespace.slice(0, -1);
        const deleteAll = base.length === 0;
        for (const key in dictionary) {
            if (Object.prototype.hasOwnProperty.call(dictionary, key) &&
                (deleteAll || key.startsWith(namespace) || key === base)) {
                delete dictionary[key];
                ++deleteCount;
            }
        }
        return deleteCount > 0;
    }
    return delete dictionary[name];
}
function iterate(dictionary, callback) {
    for (const key in dictionary) {
        callback(key, dictionary[key]);
    }
}
function setAll(dictionary, prefix, record, references) {
    let failCount;
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
function set(dictionary, key, value, references) {
    if (isValidKey(key)) {
        if (isPlainObject(value)) {
            return setAll(dictionary, key, value, references instanceof WeakSet ? references : new WeakSet());
        }
        dictionary[key] = value;
        return true;
    }
    return false;
}
function get(dictionary, key) {
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
function isValidKey(key) {
    let last, current, previous;
    if (typeof key !== 'string' || (last = key.length - 1) < 0)
        return false;
    previous = -1;
    while ((current = key.indexOf('.', previous + 1)) >= 0) {
        if (current - previous < 2 || current === last)
            return false;
        previous = current;
    }
    return true;
}
function isPlainObject(subject) {
    if (typeof subject === 'object' && subject !== null) {
        const prototype = Object.getPrototypeOf(subject);
        if (prototype === Object.prototype || prototype === null) {
            return true;
        }
    }
    return false;
}
//# sourceMappingURL=Settings.js.map