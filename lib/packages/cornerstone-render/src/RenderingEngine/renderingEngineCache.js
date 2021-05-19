const cache = {};
const renderingEngineCache = {
    /**
     * @method get Returns the `RenderingEngine` instance with the given `uid`.
     *
     * @param {string} uid The `uid` of the `RenderingEngine` instance to fetch.
     * @returns {RenderingEngine} The `RenderingEngine` instance.
     */
    get: (uid) => {
        return cache[uid];
    },
    /**
     * @method set Adds the `RenderingEngine` instance to the cache.
     *
     * @param {RenderingEngine} The `RenderingEngine` to add.
     */
    set: (re) => {
        const uid = re.uid;
        cache[uid] = re;
    },
    /**
     * @method delete Deletes the `RenderingEngine` instance from the cache.
     *
     * @param {uid} uid The `uid` of the `RenderingEngine` instance to delete.
     * @returns {boolean} True if the delete was successful.
     */
    delete: (uid) => {
        return delete cache[uid];
    },
    getAll: () => {
        const uids = Object.keys(cache);
        const renderingEngines = uids.map((uid) => cache[uid]);
        return renderingEngines;
    },
};
export default renderingEngineCache;
//# sourceMappingURL=renderingEngineCache.js.map