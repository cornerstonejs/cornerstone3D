import { Events } from './enums/index';
import RenderingEngine, {
  getRenderingEngine,
  renderingEventTarget,
} from './RenderingEngine';
import imageCache from './imageCache';
import {
  createUint8SharedArray,
  createFloat32SharedArray,
} from './sharedArrayBufferHelpers';
import register from './imageLoader/vtkjsWADOImageLoader';
import errorCodes from './errorCodes';
import CONSTANTS from './constants';
import utils, { getEnabledElement } from './utils';

export {
  RenderingEngine,
  getRenderingEngine,
  imageCache,
  createUint8SharedArray,
  createFloat32SharedArray,
  register,
  errorCodes,
  CONSTANTS,
  utils,
  getEnabledElement,
  renderingEventTarget,
  Events,
};

export default {
  RenderingEngine,
  getRenderingEngine,
  imageCache,
  createUint8SharedArray,
  createFloat32SharedArray,
  register,
  errorCodes,
  CONSTANTS,
  utils,
  getEnabledElement,
  renderingEventTarget,
  Events,
};
