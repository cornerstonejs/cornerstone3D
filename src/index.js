import RenderingEngine, { getRenderingEngine } from './RenderingEngine';
import imageCache from './imageCache';
import toolManager from './toolManager';
import {
  createUint8SharedArray,
  createFloat32SharedArray,
} from './sharedArrayBufferHelpers';
import register from './imageLoader/vtkjsWADOImageLoader';
import errorCodes from './errorCodes';
import CONSTANTS from './constants';
import utils from './utils';

// TEMP PUT THESE ON WINDOW
import './RenderingEngine/vtkClasses/vtkStreamingOpenGLVolumeMapper';

export {
  RenderingEngine,
  getRenderingEngine,
  imageCache,
  toolManager,
  createUint8SharedArray,
  createFloat32SharedArray,
  register,
  errorCodes,
  CONSTANTS,
  utils,
};

export default {
  RenderingEngine,
  getRenderingEngine,
  imageCache,
  toolManager,
  createUint8SharedArray,
  createFloat32SharedArray,
  register,
  errorCodes,
  CONSTANTS,
  utils,
};
