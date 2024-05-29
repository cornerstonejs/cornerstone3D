import createCameraPositionSynchronizer from './synchronizers/createCameraPositionSynchronizer.js';
import createPresentationViewSynchronizer from './synchronizers/createPresentationViewSynchronizer.js';
import createVOISynchronizer from './synchronizers/createVOISynchronizer.js';
import createZoomPanSynchronizer from './synchronizers/createZoomPanSynchronizer.js';
import createImageSliceSynchronizer from './synchronizers/createImageSliceSynchronizer.js';
import createSlabThicknessSynchronizer from './synchronizers/createSlabThicknessSynchronizer.js';

// for backward compatibility
const createStackImageSynchronizer = createImageSliceSynchronizer;

export {
  createCameraPositionSynchronizer,
  createPresentationViewSynchronizer,
  createVOISynchronizer,
  createZoomPanSynchronizer,
  createImageSliceSynchronizer,
  createStackImageSynchronizer,
  createSlabThicknessSynchronizer,
};
