import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';

import {
  RepresentationConfig,
  SegmentationRepresentationConfig,
  SegmentRepresentationConfig,
} from '../../../types/SegmentationStateTypes';
import { triggerSegmentationRepresentationModified } from '../triggerSegmentationEvents';

/**
 * It returns the global segmentation config.
 * @returns The global segmentation config containing the representations
 * config for each representation type and renderInactiveRepresentations flag.
 */
function getGlobalConfig(): SegmentationRepresentationConfig {
  return SegmentationState.getGlobalConfig();
}

/**
 * Set the global segmentation config
 * @param segmentationConfig - SegmentationConfig
 */
function setGlobalConfig(
  segmentationConfig: SegmentationRepresentationConfig
): void {
  SegmentationState.setGlobalConfig(segmentationConfig);
}

/**
 * Given a representation type, return the corresponding global representation config
 * @param representationType - The type of representation to query
 * @returns A representation configuration object.
 */
function getGlobalRepresentationConfig(
  representationType: SegmentationRepresentations
): RepresentationConfig['LABELMAP'] {
  const globalConfig = getGlobalConfig();
  return globalConfig.representations[representationType];
}

/**
 * Set the global configuration for a given representation type. It fires
 * a SEGMENTATION_MODIFIED event.
 *
 * @triggers SEGMENTATION_MODIFIED
 * @param representationType - The type of representation to set config for
 * @param config - The configuration for the representation.
 */
function setGlobalRepresentationConfig(
  representationType: SegmentationRepresentations,
  config: RepresentationConfig['LABELMAP']
): void {
  const globalConfig = getGlobalConfig();

  setGlobalConfig({
    ...globalConfig,
    representations: {
      ...globalConfig.representations,
      [representationType]: {
        ...globalConfig.representations[representationType],
        ...config,
      },
    },
  });
}

/**
 * Retrieves the configuration for all segments of a given segmentation representation.
 *
 * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
 * @returns The representation configuration for all segments.
 */
function getSegmentationRepresentationConfig(
  segmentationRepresentationUID: string
): RepresentationConfig {
  return SegmentationState.getSegmentationRepresentationConfig(
    segmentationRepresentationUID
  );
}

/**
 * Sets the configuration for all segments of a given segmentation representation.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param config - The configuration to be set for all segments.
 */
function setAllSegmentsConfig(
  segmentationRepresentationUID: string,
  config: RepresentationConfig
): void {
  SegmentationState.setAllSegmentsConfig(segmentationRepresentationUID, config);
}

/**
 * Sets the configuration that is specific to each segment in the segmentation representation.
 * Note this is setting configuration for each segmetn in bulk
 *
 * @param segmentationRepresentationUID - The unique identifier of the segmentation representation.
 * @param config - The configuration to be set for the segmentation representation.
 */
function setPerSegmentConfig(
  segmentationRepresentationUID: string,
  config: SegmentRepresentationConfig
): void {
  SegmentationState.setPerSegmentConfig(segmentationRepresentationUID, config);
}

/**
 * Retrieves the segment representation configuration for a given segmentation representation UID.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns The segment representation configuration.
 */
function getPerSegmentConfig(
  segmentationRepresentationUID: string
): SegmentRepresentationConfig {
  return SegmentationState.getPerSegmentConfig(segmentationRepresentationUID);
}

/**
 * Sets the configuration for a specific segment index in a segmentation representation.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param segmentIndex - The index of the segment.
 * @param config - The configuration to set for the segment.
 * @param suppressEvent - Optional. If true, the segmentation representation modified event will not be triggered. Default is false.
 */
function setSegmentIndexConfig(
  segmentationRepresentationUID: string,
  segmentIndex: number,
  config: RepresentationConfig,
  suppressEvent = false
): void {
  const perSegment = SegmentationState.getPerSegmentConfig(
    segmentationRepresentationUID
  );

  perSegment[segmentIndex] = config;

  if (!suppressEvent) {
    triggerSegmentationRepresentationModified(segmentationRepresentationUID);
  }
}

/**
 * Get the segment specific configuration for the segmentation representation.
 *
 * @param segmentationRepresentationUID  - The uid of the segmentation representation
 * @param segmentIndex - The index of the segment
 * @returns - The configuration for the segment index in the segmentation representation
 */
function getSegmentIndexConfig(
  segmentationRepresentationUID: string,
  segmentIndex: number
): RepresentationConfig {
  const perSegment = SegmentationState.getPerSegmentConfig(
    segmentationRepresentationUID
  );

  return perSegment?.[segmentIndex];
}

export {
  // Global
  getGlobalConfig,
  setGlobalConfig,
  getGlobalRepresentationConfig,
  setGlobalRepresentationConfig,
  // segmentation representation config
  getSegmentationRepresentationConfig,
  setAllSegmentsConfig,
  setPerSegmentConfig,
  getPerSegmentConfig,
  // segment index get/set
  setSegmentIndexConfig,
  getSegmentIndexConfig,
};
