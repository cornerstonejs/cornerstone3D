// @ts-ignore
import customCallbackHandler from './../shared/customCallbackHandler.ts';

const mouseDoubleClick = customCallbackHandler.bind(
  null,
  'Mouse',
  'doubleClickCallback'
);

export default mouseDoubleClick;
