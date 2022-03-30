import customCallbackHandler from '../shared/customCallbackHandler';

/**
 * @function mouseDoubleClick - Event handler for mouse double click events. Uses `customCallbackHandler` to fire
 * the `doubleClickCallback` function on active tools.
 */
const mouseDoubleClick = customCallbackHandler.bind(
  null,
  'Mouse',
  'doubleClickCallback'
);

export default mouseDoubleClick;
