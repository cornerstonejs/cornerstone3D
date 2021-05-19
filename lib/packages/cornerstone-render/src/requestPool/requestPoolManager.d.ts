declare type AdditionalDetails = {
    imageId?: string;
    volumeUID?: string;
};
declare type RequestDetailsInterface = {
    requestFn: () => Promise<void>;
    type: string;
    additionalDetails: AdditionalDetails;
};
declare type RequestPool = {
    interaction: {
        [key: number]: [];
    };
    thumbnail: {
        [key: number]: [];
    };
    prefetch: {
        [key: number]: [];
    };
};
/**
 * Adds the requests to the pool of requests.
 *
 * @param requestFn - A function that returns a promise which resolves in the image
 * @param type - Priority category, it can be either of interaction, prefetch,
 * or thumbnail.
 * @param additionalDetails - Additional details that requests can contain.
 * For instance the volumeUID for the volume requests
 * @param priority - Priority number for each category of requests. Its default
 * value is priority 0. The lower the priority number, the higher the priority number
 *
 * @returns void
 *
 */
declare function addRequest(requestFn: () => Promise<void>, type: string, additionalDetails: Record<string, unknown>, priority?: number): void;
/**
 * Filter the requestPoolManager's pool of request based on the result of
 * provided filter function. The provided filter function needs to return false or true
 *
 * @param filterFunction The filter function for filtering of the requests to keep
 * @category requestPool
 */
declare function filterRequests(filterFunction: (requestDetails: RequestDetailsInterface) => boolean): void;
/**
 * Clears the requests specific to the provided type. For instance, the
 * pool of requests of type 'interaction' can be cleared via this function.
 *
 *
 * @param type category of the request (either interaction, prefetch or thumbnail)
 * @category requestPool
 */
declare function clearRequestStack(type: string): void;
/**
 * Returns the request pool containing different categories, their priority and
 * the added request details.
 *
 * @returns
 * @category requestPool
 */
declare function getRequestPool(): RequestPool;
declare const requestPoolManager: {
    addRequest: typeof addRequest;
    clearRequestStack: typeof clearRequestStack;
    getRequestPool: typeof getRequestPool;
    filterRequests: typeof filterRequests;
};
export default requestPoolManager;
