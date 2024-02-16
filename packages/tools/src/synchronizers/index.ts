import createCameraPositionSynchronizer from './synchronizers/createCameraPositionSynchronizer';
import createVOISynchronizer from './synchronizers/createVOISynchronizer';
import createZoomPanSynchronizer from './synchronizers/createZoomPanSynchronizer';
import createImageSliceSynchronizer from './synchronizers/createImageSliceSynchronizer';
import createPresentationViewSynchronizer from './synchronizers/createPresentationViewSynchronizer';

// for backward compatibility
const createStackImageSynchronizer = createImageSliceSynchronizer;

export {
  createCameraPositionSynchronizer,
  createVOISynchronizer,
  createZoomPanSynchronizer,
  createImageSliceSynchronizer,
  createStackImageSynchronizer,
  createPresentationViewSynchronizer,
};
