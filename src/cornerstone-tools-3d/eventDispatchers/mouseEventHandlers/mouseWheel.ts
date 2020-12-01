import customCallbackHandler from './../shared/customCallbackHandler';

const mouseWheel = customCallbackHandler.bind(
  null,
  'MouseWheel',
  'mouseWheelCallback'
);

export default mouseWheel;
