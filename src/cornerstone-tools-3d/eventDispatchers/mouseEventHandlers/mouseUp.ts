import customCallbackHandler from './../shared/customCallbackHandler';

const mouseUp = customCallbackHandler.bind(null, 'Mouse', 'mouseUpCallback');

export default mouseUp;
