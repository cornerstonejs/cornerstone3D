import createCameraPositionSynchronizer from './createCameraPositionSynchronizer';
import createVOISynchronizer from './createVOISynchronizer';
import createZoomPanSynchronizer from './createZoomPanSynchronizer';
import createImageSliceSynchronizer from './createImageSliceSynchronizer';

// for backward compatibility
const createStackImageSynchronizer = createImageSliceSynchronizer;
export {
  createCameraPositionSynchronizer,
  createVOISynchronizer,
  createZoomPanSynchronizer,
  createImageSliceSynchronizer,
  createStackImageSynchronizer,
};
