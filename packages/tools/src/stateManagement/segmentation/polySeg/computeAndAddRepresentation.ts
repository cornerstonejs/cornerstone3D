import { eventTarget } from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../../enums';
import addRepresentationData from '../addRepresentationData';
import { triggerSegmentationModified } from '../triggerSegmentationEvents';
import { debounce } from '../../../utilities';
import { registerPolySegWorker } from './registerPolySegWorker';

const computedRepresentations = new Map<
  string,
  SegmentationRepresentations[]
>();

/**
 * Computes a representation using the provided computation function, adds the computed data,
 * subscribes to segmentation changes, and triggers segmentation modification.
 *
 * @param segmentationId - The ID of the segmentation.
 * @param representationType - The type of the segmentation representation.
 * @param computeFunction - The function that computes the representation data.
 * @param options - Additional options for computing the representation.
 * @returns - A promise that resolves with the computed representation data.
 */
async function computeAndAddRepresentation<T>(
  segmentationId: string,
  representationType: SegmentationRepresentations,
  computeFunction: () => Promise<T>,
  updateFunction?: () => void
): Promise<T> {
  // register the worker if it hasn't been registered yet
  registerPolySegWorker();

  // Compute the specific representation data
  const data = await computeFunction();

  // Add the computed data to the system
  addRepresentationData({
    segmentationId,
    type: representationType,
    data,
  });

  // Update internal structures and possibly UI components
  if (!computedRepresentations.has(segmentationId)) {
    computedRepresentations.set(segmentationId, []);
  }

  const representations = computedRepresentations.get(segmentationId);
  if (!representations.includes(representationType)) {
    representations.push(representationType);
  }

  // Subscribe to any changes in the segmentation data for real-time updates
  subscribeToSegmentationChanges(updateFunction);

  // Notify other system parts that segmentation data has been modified
  triggerSegmentationModified(segmentationId);

  return data;
}

/**
 * Subscribes to segmentation changes by adding an event listener for the SEGMENTATION_DATA_MODIFIED event.
 * If there is an existing listener, it will be unsubscribed before adding the new listener.
 */
function subscribeToSegmentationChanges(updateFunction) {
  const debouncedUpdateFunction = (event) => {
    _debouncedSegmentationModified(event, updateFunction);
  };

  updateFunction._debouncedUpdateFunction = debouncedUpdateFunction;

  eventTarget.removeEventListener(
    Events.SEGMENTATION_DATA_MODIFIED,
    updateFunction._debouncedUpdateFunction
  );

  eventTarget.addEventListener(
    Events.SEGMENTATION_DATA_MODIFIED,
    updateFunction._debouncedUpdateFunction
  );
}

const _debouncedSegmentationModified = debounce((event, updateFunction) => {
  const segmentationId = event.detail.segmentationId;
  const representations = computedRepresentations.get(segmentationId);
  if (!representations || !representations.length) {
    return;
  }

  updateFunction(segmentationId);

  if (representations.length) {
    triggerSegmentationModified(segmentationId);
  }
}, 300);

export { computeAndAddRepresentation };
