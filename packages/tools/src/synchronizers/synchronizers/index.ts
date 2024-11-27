import createCameraPositionSynchronizer from './createCameraPositionSynchronizer';
import createPresentationViewSynchronizer from './createPresentationViewSynchronizer';
import createVOISynchronizer from './createVOISynchronizer';
import createZoomPanSynchronizer from './createZoomPanSynchronizer';
import createImageSliceSynchronizer from './createImageSliceSynchronizer';

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
