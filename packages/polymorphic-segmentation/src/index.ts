import { computeContourData } from './Contour/contourComputationStrategies';
import { computeLabelmapData } from './Labelmap/labelmapComputationStrategies';
import { computeSurfaceData } from './Surface/surfaceComputationStrategies';
import { canComputeRequestedRepresentation } from './canComputeRequestedRepresentation';

// updates
import { updateSurfaceData } from './Surface/updateSurfaceData';
import { registerPolySegWorker } from './registerPolySegWorker';
import { clipAndCacheSurfacesForViewport } from './utilities/clipAndCacheSurfacesForViewport';
import { extractContourData } from './Contour/utils/extractContourData';
import { createAndAddContourSegmentationsFromClippedSurfaces } from './Contour/utils/createAndAddContourSegmentationsFromClippedSurfaces';
function init() {
  // register the worker if it hasn't been registered yet
  registerPolySegWorker();
}

export {
  canComputeRequestedRepresentation,
  // computes
  computeContourData,
  computeLabelmapData,
  computeSurfaceData,
  // updates
  updateSurfaceData,
  // init
  init,
  clipAndCacheSurfacesForViewport,
  extractContourData,
  createAndAddContourSegmentationsFromClippedSurfaces,
};
