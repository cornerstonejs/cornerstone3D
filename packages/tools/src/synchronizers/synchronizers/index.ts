import createCameraPositionSynchronizer from './createCameraPositionSynchronizer.js';
import createPresentationViewSynchronizer from './createPresentationViewSynchronizer.js';
import createVOISynchronizer from './createVOISynchronizer.js';
import createZoomPanSynchronizer from './createZoomPanSynchronizer.js';
import createImageSliceSynchronizer from './createImageSliceSynchronizer.js';

// for backward compatibility
const createStackImageSynchronizer = createImageSliceSynchronizer;
export {
  createCameraPositionSynchronizer,
  createPresentationViewSynchronizer,
  createVOISynchronizer,
  createZoomPanSynchronizer,
  createImageSliceSynchronizer,
  createStackImageSynchronizer,
};
