import { eventTarget, type Types } from '@cornerstonejs/core';
import { Events, SegmentationRepresentations } from '../../enums';
import { triggerSegmentationModified } from './triggerSegmentationEvents';
import debounce from '../../utilities/debounce';
import surfaceDisplay from '../../tools/displayTools/Surface/surfaceDisplay';
import contourDisplay from '../../tools/displayTools/Contour/contourDisplay';
import labelmapDisplay from '../../tools/displayTools/Labelmap/labelmapDisplay';

const renderers = {
  [SegmentationRepresentations.Labelmap]: labelmapDisplay,
  [SegmentationRepresentations.Contour]: contourDisplay,
  [SegmentationRepresentations.Surface]: surfaceDisplay,
};

/**
 * Tracks event listeners for each segmentation and representation type.
 *
 * Structure:
 * Map<segmentationId, Map<representationType, EventListener>>
 */
const segmentationListeners = new Map<string, Map<string, EventListener>>();

/**
 * Add the default listener of the given SegmentationRepresentation type.
 * @param viewport - viewport to which the representation was added
 * @param segmentationId - ID of the segmentation
 * @param representationType - representation type
 */
export function addDefaultSegmentationListener(
  viewport: Types.IVolumeViewport | Types.IStackViewport,
  segmentationId: string,
  representationType: SegmentationRepresentations
) {
  const updateFunction =
    renderers[representationType].getUpdateFunction(viewport);
  if (updateFunction) {
    addSegmentationListener(segmentationId, representationType, updateFunction);
  }
}

/**
 * Subscribes to segmentation update events for a given segmentation and calls the given updateFunction for the given representation.
 *
 * @param segmentationId - ID of the segmentation.
 * @param representationType - Representation type (e.g., Labelmap, Surface, etc.).
 * @param updateFunction - Function to handle segmentation updates.
 */
function addSegmentationListener(
  segmentationId: string,
  representationType: string,
  updateFunction: (segmentationId: string) => Promise<void>
): void {
  // Ensure segmentation entry exists in the map
  if (!segmentationListeners.has(segmentationId)) {
    segmentationListeners.set(segmentationId, new Map());
  }

  const listenerMap = segmentationListeners.get(segmentationId)!;

  // If existing listener, remove it before adding the new one
  if (listenerMap.has(representationType)) {
    removeSegmentationListener(segmentationId, representationType);
  }

  // Create and register a new debounced listener
  const listener = createDebouncedSegmentationListener(
    segmentationId,
    updateFunction
  );
  eventTarget.addEventListener(Events.SEGMENTATION_DATA_MODIFIED, listener);

  // Store the listener for future cleanup
  listenerMap.set(representationType, listener);
}

/**
 * Unsubscribes from segmentation update events for a given segmentation and representation type.
 *
 * @param segmentationId - ID of the segmentation.
 * @param representationType - Representation type to unsubscribe from.
 */
function removeSegmentationListener(
  segmentationId: string,
  representationType: string
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
  listenerMap.delete(representationType);
}

/**
 * Unsubscribes and removes all listeners for a given segmentation.
 *
 * @param segmentationId - ID of the segmentation to completely remove.
 */
function removeAllSegmentationListeners(segmentationId: string): void {
  const listenerMap = segmentationListeners.get(segmentationId);
  if (!listenerMap) {
    return;
  }

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

/**
 * Helper function to create a debounced segmentation event handler.
 *
 * @param segmentationId - ID of the segmentation to listen for.
 * @param updateFunction - Callback to execute when segmentation data changes.
 * @returns An event listener compatible with the Cornerstone event system.
 */
function createDebouncedSegmentationListener(
  segmentationId: string,
  updateFunction: (segmentationId: string) => Promise<void>
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

export {
  addSegmentationListener,
  removeSegmentationListener,
  removeAllSegmentationListeners,
};
