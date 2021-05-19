/**
 * @class Settings
 */
export default class Settings {
    constructor(base?: Settings);
    set(key: string, value: unknown): boolean;
    get(key: string): unknown;
    /**
     * Unset a specific key or a set of keys within a namespace when the key ends with a dot (ASCII #46).
     * If the key is ".", all keys will be removed and this command works as a reset.
     * @param {object} dictionary The dictionary on which to unset a key.
     * @param {string} name The key to be unset or a namespace.
     * @returns boolean
     */
    unset(key: string): boolean;
    forEach(callback: (key: string, value: unknown) => void): void;
    extend(): Settings;
    static assert(subject: Settings): Settings;
    static getDefaultSettings(): Settings;
    static getRuntimeSettings(): Settings;
    static getObjectSettings(subject: unknown, from?: unknown): Settings;
    static extendRuntimeSettings(): Settings;
}
