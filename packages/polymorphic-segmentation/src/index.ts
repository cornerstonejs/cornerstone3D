import { computeContourData } from './Contour/contourComputationStrategies';
import { computeLabelmapData } from './Labelmap/labelmapComputationStrategies';
import { computeSurfaceData } from './Surface/surfaceComputationStrategies';
import { canComputeRequestedRepresentation } from './canComputeRequestedRepresentation';

// updates
import { updateSurfaceData } from './Surface/updateSurfaceData';
import {
  registerPolySegWorker,
  type PolySegInitOptions,
} from './registerPolySegWorker';
import { clipAndCacheSurfacesForViewport } from './utilities/clipAndCacheSurfacesForViewport';
import { extractContourData } from './Contour/utils/extractContourData';
import { createAndAddContourSegmentationsFromClippedSurfaces } from './Contour/utils/createAndAddContourSegmentationsFromClippedSurfaces';

function init(options?: PolySegInitOptions) {
  // register the worker if it hasn't been registered yet
  registerPolySegWorker(options);
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
