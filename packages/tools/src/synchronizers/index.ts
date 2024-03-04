import createCameraPositionSynchronizer from './synchronizers/createCameraPositionSynchronizer';
import createPresentationViewSynchronizer from './synchronizers/createPresentationViewSynchronizer';
import createVOISynchronizer from './synchronizers/createVOISynchronizer';
import createZoomPanSynchronizer from './synchronizers/createZoomPanSynchronizer';
import createImageSliceSynchronizer from './synchronizers/createImageSliceSynchronizer';

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
