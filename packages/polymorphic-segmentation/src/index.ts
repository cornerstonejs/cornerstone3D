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
};
