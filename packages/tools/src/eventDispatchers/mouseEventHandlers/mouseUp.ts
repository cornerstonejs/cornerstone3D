import customCallbackHandler from '../shared/customCallbackHandler';

/**
 * mouseClick - Event handler for mouse up events. Uses `customCallbackHandler` to fire
 * the `mouseUpCallback` function on active tools.
 */
const mouseUp = customCallbackHandler.bind(null, 'Mouse', 'mouseUpCallback');

export default mouseUp;
