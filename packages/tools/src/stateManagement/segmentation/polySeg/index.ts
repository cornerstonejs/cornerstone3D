import { computeAndAddSurfaceRepresentation } from './Surface/computeAndAddSurfaceRepresentation.js';
import { computeAndAddLabelmapRepresentation } from './Labelmap/computeAndAddLabelmapRepresentation.js';
import { computeAndAddContourRepresentation } from './Contour/computeAndAddContourRepresentation.js';
import { canComputeRequestedRepresentation } from './canComputeRequestedRepresentation.js';

export {
  canComputeRequestedRepresentation,
  // computed representations
  computeAndAddSurfaceRepresentation,
  computeAndAddLabelmapRepresentation,
  computeAndAddContourRepresentation,
};
