// @ts-ignore
import customCallbackHandler from './../shared/customCallbackHandler.ts';

const mouseWheel = customCallbackHandler.bind(
  null,
  'MouseWheel',
  'mouseWheelCallback'
);

export default mouseWheel;
