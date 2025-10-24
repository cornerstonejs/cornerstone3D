import { eventTarget } from '@cornerstonejs/core';
import { Events } from '../../enums';
import { triggerSegmentationModified } from '../../stateManagement/segmentation/triggerSegmentationEvents';
import debounce from '../debounce';

/**
 * Tracks event listeners for each segmentation and representation type.
 *
 * Structure:
 * Map<segmentationId, Map<representationType, EventListener>>
 */
const segmentationListeners = new Map<string, Map<string, EventListener>>();

/**
 * Creates a debounced segmentation event handler.
 *
 * @param segmentationId - ID of the segmentation to listen for.
 * @param updateFunction - Callback to execute when segmentation data changes.
 * @returns An event listener compatible with the Cornerstone event system.
 */
function createDebouncedSegmentationListener(
  segmentationId: string,
  updateFunction: (segmentationId: string) => void
): EventListener {
  // Debounced function ensures that frequent segmentation updates
  // trigger the update function at most once every 300ms.
  const debouncedHandler = debounce((event: CustomEvent) => {
    const eventSegmentationId = event.detail?.segmentationId;

    // Execute only if the event is relevant to this segmentation
    if (eventSegmentationId === segmentationId) {
      updateFunction(segmentationId);
      triggerSegmentationModified(segmentationId);
    }
  }, 300);

  // Return the debounced handler as a standard EventListener
  return ((event: Event) => {
    debouncedHandler(event as CustomEvent);
  }) as EventListener;
}

/**
 * Subscribes to segmentation update events for a given segmentation and representation type.
 *
 * @param segmentationId - Unique ID of the segmentation.
 * @param representationType - Representation type (e.g., Labelmap, Surface, etc.).
 * @param updateFunction - Optional function to handle updates.
 *
 * If `updateFunction` is not provided, this will reattach an existing handler if one was stored earlier.
 */
function addSegmentationListener(
  segmentationId: string,
  representationType: string,
  updateFunction?: (segmentationId: string) => void
): void {
  // Ensure segmentation entry exists in the map
  if (!segmentationListeners.has(segmentationId)) {
    segmentationListeners.set(segmentationId, new Map());
  }

  const listenerMap = segmentationListeners.get(segmentationId)!;

  // If no `updateFunction` is provided, reattach stored listener (if exists)
  if (!updateFunction) {
    const existingListener = listenerMap.get(representationType);
    if (existingListener) {
      // The listener may have been previously removed or become inactive
      // (e.g., when temporarily deactivating a segmentation representation),
      // so remove any stale registration and reattach it to ensure it is
      // actively listening for segmentation updates.
      removeRepresentationListener(segmentationId, representationType);
      eventTarget.addEventListener(
        Events.SEGMENTATION_DATA_MODIFIED,
        existingListener
      );
    }
    return;
  }

  // Prevent duplicate listeners for the same segmentation/type
  if (listenerMap.has(representationType)) {
    return;
  }

  // Create and register a new debounced listener
  const listener = createDebouncedSegmentationListener(
    segmentationId,
    updateFunction
  );
  eventTarget.addEventListener(Events.SEGMENTATION_DATA_MODIFIED, listener);

  // Store the listener for future reattachment or cleanup
  listenerMap.set(representationType, listener);
}

/**
 * Unsubscribes from segmentation update events for a given segmentation and representation type.
 *
 * @param segmentationId - ID of the segmentation.
 * @param representationType - Representation type to unsubscribe from.
 * @param clearMapEntry - Optional flag to remove listener from the map. Defaults to false.
 */
function removeRepresentationListener(
  segmentationId: string,
  representationType: string,
  clearMapEntry: boolean = false
): void {
  const listenerMap = segmentationListeners.get(segmentationId);
  if (!listenerMap) {
    return;
  }

  const listener = listenerMap.get(representationType);
  if (!listener) {
    return;
  }

  // Remove the event listener
  eventTarget.removeEventListener(Events.SEGMENTATION_DATA_MODIFIED, listener);

  // The `clearMapEntry` flag determines whether the listener entry should be
  // completely removed from the tracking map. In some cases, we only want to
  // unsubscribe the event listener (e.g., when temporarily deactivating a
  // segmentation representation) but keep its reference in the map so it can
  // be reattached later if `addSegmentationListener` is called without a new
  // update function. The entry is only deleted when `clearMapEntry` is true,
  // ensuring proper cleanup during full removal.
  if (clearMapEntry) {
    listenerMap.delete(representationType);
    // Optionally remove the segmentationId entry if no more listeners
    if (listenerMap.size === 0) {
      segmentationListeners.delete(segmentationId);
    }
  }
}

/**
 * Unsubscribes and removes all listeners for a given segmentation.
 *
 * @param segmentationId - ID of the segmentation to completely remove.
 */
function removeAllSegmentationListeners(segmentationId: string): void {
  const listenerMap = segmentationListeners.get(segmentationId);
  if (!listenerMap) return;

  // Remove all event listeners for this segmentation
  for (const listener of listenerMap.values()) {
    eventTarget.removeEventListener(
      Events.SEGMENTATION_DATA_MODIFIED,
      listener
    );
  }

  // Remove the segmentation entry from the map
  segmentationListeners.delete(segmentationId);
}

export {
  addSegmentationListener,
  removeRepresentationListener,
  removeAllSegmentationListeners,
};
