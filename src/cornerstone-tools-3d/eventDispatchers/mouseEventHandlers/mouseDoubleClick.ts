import customCallbackHandler from './../shared/customCallbackHandler';

const mouseDoubleClick = customCallbackHandler.bind(
  null,
  'Mouse',
  'doubleClickCallback'
);

export default mouseDoubleClick;
