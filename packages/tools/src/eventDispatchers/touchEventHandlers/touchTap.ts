import customCallbackHandler from '../shared/customCallbackHandler';

/**
 * touchTap - Event handler for touch tap events. Uses `customCallbackHandler` to fire
 * the `touchTapCallback` function on active tools.
 */
const touchTap = customCallbackHandler.bind(null, 'Touch', 'touchTapCallback');

export default touchTap;
