import createCameraPositionSynchronizer from './createCameraPositionSynchronizer';
import createViewFramingSynchronizer from './createViewFramingSynchronizer';
import createVOISynchronizer from './createVOISynchronizer';
import createZoomPanSynchronizer from './createZoomPanSynchronizer';
import createImageSliceSynchronizer from './createImageSliceSynchronizer';

// for backward compatibility
const createStackImageSynchronizer = createImageSliceSynchronizer;
export {
  createCameraPositionSynchronizer,
  createViewFramingSynchronizer,
  createVOISynchronizer,
  createZoomPanSynchronizer,
  createImageSliceSynchronizer,
  createStackImageSynchronizer,
};
