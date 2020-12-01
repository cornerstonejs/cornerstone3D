// @ts-ignore
import customCallbackHandler from './../shared/customCallbackHandler.ts';

const mouseClick = customCallbackHandler.bind(
  null,
  'Mouse',
  'mouseClickCallback'
);

export default mouseClick;
