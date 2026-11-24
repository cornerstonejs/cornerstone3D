import createCameraPositionSynchronizer from './synchronizers/createCameraPositionSynchronizer';
import createViewFramingSynchronizer from './synchronizers/createViewFramingSynchronizer';
import createVOISynchronizer from './synchronizers/createVOISynchronizer';
import createZoomPanSynchronizer from './synchronizers/createZoomPanSynchronizer';
import createImageSliceSynchronizer from './synchronizers/createImageSliceSynchronizer';
import createSlabThicknessSynchronizer from './synchronizers/createSlabThicknessSynchronizer';
import imageSliceSyncCallback from './callbacks/imageSliceSyncCallback';

// for backward compatibility
const createStackImageSynchronizer = createImageSliceSynchronizer;

export {
  createCameraPositionSynchronizer,
  createViewFramingSynchronizer,
  createVOISynchronizer,
  createZoomPanSynchronizer,
  createImageSliceSynchronizer,
  createStackImageSynchronizer,
  createSlabThicknessSynchronizer,
  imageSliceSyncCallback,
};
