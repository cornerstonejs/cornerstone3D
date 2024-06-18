import customCallbackHandler from '../shared/customCallbackHandler.js';

/**
 * mouseClick - Event handler for mouse click events. Uses `customCallbackHandler` to fire
 * the `mouseClickCallback` function on active tools.
 */
const mouseClick = customCallbackHandler.bind(
  null,
  'Mouse',
  'mouseClickCallback'
);

export default mouseClick;
