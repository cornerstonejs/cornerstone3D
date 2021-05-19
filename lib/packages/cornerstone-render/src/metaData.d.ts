/**
 * Adds a metadata provider with the specified priority
 * @param {Function} provider Metadata provider function
 * @param {Number} [priority=0] - 0 is default/normal, > 0 is high, < 0 is low
 *
 * @returns {void}
 *
 * @function addProvider
 * @category MetaData
 */
export declare function addProvider(provider: (type: string, imageId: string) => {
    any: any;
}, priority?: number): void;
/**
 * Removes the specified provider
 *
 * @param {Function} provider Metadata provider function
 *
 * @returns {void}
 *
 * @function removeProvider
 * @category MetaData
 */
export declare function removeProvider(provider: (type: string, imageId: string) => {
    any: any;
}): void;
/**
 * Removes all providers
 *
 *
 * @returns {void}
 *
 * @function removeAllProviders
 * @category MetaData
 */
export declare function removeAllProviders(): void;
/**
 * Gets metadata from the registered metadata providers.  Will call each one from highest priority to lowest
 * until one responds
 *
 * @param {String} type The type of metadata requested from the metadata store
 * @param {String} imageId The Cornerstone Image Object's imageId
 *
 * @returns {*} The metadata retrieved from the metadata store
 * @category MetaData
 */
declare function getMetaData(type: string, imageId: string): any;
declare const metaData: {
    addProvider: typeof addProvider;
    removeProvider: typeof removeProvider;
    removeAllProviders: typeof removeAllProviders;
    get: typeof getMetaData;
};
export { metaData };
export default metaData;
