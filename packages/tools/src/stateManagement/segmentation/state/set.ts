import type {
  RepresentationConfig,
  SegmentationRepresentationConfig,
  SegmentSpecificRepresentationConfig,
} from '../../../types/SegmentationStateTypes';

import { getDefaultSegmentationStateManager } from './get';
import {
  triggerSegmentationModified,
  triggerSegmentationRepresentationModified,
} from '../triggerSegmentationEvents';

/**
 * Set the segmentation representation config for the provided toolGroup. ToolGroup specific
 * configuration overwrites the global configuration for each representation.
 * It fires SEGMENTATION_REPRESENTATION_MODIFIED event if not suppressed.
 *
 * @triggers SEGMENTATION_REPRESENTATION_MODIFIED
 * @param toolGroupId - The Id of the tool group that the segmentation
 * config is being set for.
 * @param config - The new configuration for the tool group.
 * @param suppressEvents - If true, the event will not be triggered.
 */
function setToolGroupSpecificConfig(
  toolGroupId: string,
  config: SegmentationRepresentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setSegmentationRepresentationConfig(
    toolGroupId,
    config
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(toolGroupId);
  }
}

/**
 * It sets the segmentation representation specific config for all the segments
 * inside the segmentation.
 * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
 * @param config  - The new configuration for the segmentation representation it is an object with keys of
 * different representation types, and values of the configuration for each representation type.
 */
function setSegmentationRepresentationSpecificConfig(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  config: RepresentationConfig,
  suppressEvents = false
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setSegmentationRepresentationSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID,
    config
  );

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(
      toolGroupId,
      segmentationRepresentationUID
    );
  }
}

function setSegmentSpecificRepresentationConfig(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  config: SegmentSpecificRepresentationConfig,
  suppressEvents = false
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setSegmentSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID,
    config
  );

  // Todo: this can be even more performant if we create a new event for
  // triggering a specific segment config change.
  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(
      toolGroupId,
      segmentationRepresentationUID
    );
  }
}

/**
 * Set the global segmentation configuration. It fires SEGMENTATION_MODIFIED
 * event if not suppressed.
 *
 * @triggers SEGMENTATION_MODIFIED
 * @param config - The new global segmentation config.
 * @param suppressEvents - If true, the `segmentationGlobalStateModified` event will not be triggered.
 */
function setGlobalConfig(
  config: SegmentationRepresentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager();
  segmentationStateManager.setGlobalConfig(config);

  if (!suppressEvents) {
    triggerSegmentationModified();
  }
}

export {
  setToolGroupSpecificConfig,
  setSegmentationRepresentationSpecificConfig,
  setSegmentSpecificRepresentationConfig,
  setGlobalConfig,
};
