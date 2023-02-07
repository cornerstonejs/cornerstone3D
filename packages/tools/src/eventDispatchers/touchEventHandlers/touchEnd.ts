import customCallbackHandler from '../shared/customCallbackHandler';

/**
 * touchEnd - Event handler for touchEnd events. Uses `customCallbackHandler` to fire
 * the `touchEndCallback` function on active tools.
 */
const touchEnd = customCallbackHandler.bind(null, 'Touch', 'touchEndCallback');

export default touchEnd;
