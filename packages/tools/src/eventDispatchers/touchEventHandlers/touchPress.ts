import customCallbackHandler from '../shared/customCallbackHandler.js';

/**
 * touchPress - Event handler for touch press events. Uses `customCallbackHandler` to fire
 * the `touchPressCallback` function on active tools.
 */
const touchPress = customCallbackHandler.bind(
  null,
  'Touch',
  'touchPressCallback'
);

export default touchPress;
