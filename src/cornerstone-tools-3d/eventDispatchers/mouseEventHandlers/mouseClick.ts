import customCallbackHandler from './../shared/customCallbackHandler';

const mouseClick = customCallbackHandler.bind(
  null,
  'Mouse',
  'mouseClickCallback'
);

export default mouseClick;
