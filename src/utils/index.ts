import uuidv4 from './uuidv4';
import invertRgbTransferFunction from './invertRgbTransferFunction';
import scaleRgbTransferFunction from './scaleRgbTransferFunction';
import getEnabledElement from './getEnabledElement';

/** NAMED EXPORTS */
export { uuidv4, invertRgbTransferFunction, getEnabledElement };

/** DEFAULT EXPORT */
const utils = {
  uuidv4,
  invertRgbTransferFunction,
  scaleRgbTransferFunction,
  getEnabledElement,
};

export default utils;
