import customCallbackHandler from '../shared/customCallbackHandler';

/**
 * Event handler for mouse wheel events. Uses `customCallbackHandler` to fire
 * the `mouseWheelCallback` function on active tools.
 */
const mouseWheel = customCallbackHandler.bind(
  null,
  'MouseWheel',
  'mouseWheelCallback'
);

export default mouseWheel;
