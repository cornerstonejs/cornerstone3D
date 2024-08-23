import type SegmentationRepresentations from '../../../enums/SegmentationRepresentations';

import type {
  GlobalConfig,
  RepresentationConfig,
} from '../../../types/SegmentationStateTypes';
import { triggerSegmentationRepresentationModified } from '../triggerSegmentationEvents';
import { getGlobalConfig as _getGlobalConfig } from '../getGlobalConfig';
import { setGlobalConfig as _setGlobalConfig } from '../setGlobalConfig';
import { getSegmentationRepresentationConfig as _getSegmentationRepresentationConfig } from '../getSegmentationRepresentationConfig';
import { setSegmentationRepresentationConfig as _setSegmentationRepresentationConfig } from '../setSegmentationRepresentationConfig';
import { setPerSegmentConfig as _setPerSegmentConfig } from '../setPerSegmentConfig';
import { getPerSegmentConfig as _getPerSegmentConfig } from '../getPerSegmentConfig';
import type { LabelmapConfig } from '../../../types/LabelmapTypes';

/**
 * It returns the global segmentation config.
 * @returns The global segmentation config containing the representations
 * config for each representation type and renderInactiveRepresentations flag.
 */
function getGlobalConfig(): GlobalConfig {
  return _getGlobalConfig();
}

/**
 * Set the global segmentation config
 * @param segmentationConfig - SegmentationConfig
 */
function setGlobalConfig(segmentationConfig: GlobalConfig): void {
  _setGlobalConfig(segmentationConfig);
}

/**
 * Given a representation type, return the corresponding global representation config
 * @param representationType - The type of representation to query
 * @returns A representation configuration object.
 */
function getGlobalRepresentationConfig(
  representationType: SegmentationRepresentations
): LabelmapConfig {
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
  config: LabelmapConfig
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
  return _getSegmentationRepresentationConfig(segmentationRepresentationUID);
}

/**
 * Sets the configuration for all segments of a given segmentation representation.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @param config - The configuration to be set for all segments.
 */
function setSegmentationRepresentationConfig(
  segmentationRepresentationUID: string,
  config: RepresentationConfig
): void {
  _setSegmentationRepresentationConfig(segmentationRepresentationUID, config);
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
  config: RepresentationConfig
): void {
  _setPerSegmentConfig(segmentationRepresentationUID, config);
}

/**
 * Retrieves the segment representation configuration for a given segmentation representation UID.
 *
 * @param segmentationRepresentationUID - The UID of the segmentation representation.
 * @returns The segment representation configuration.
 */
function getPerSegmentConfig(
  segmentationRepresentationUID: string
): RepresentationConfig {
  return _getPerSegmentConfig(segmentationRepresentationUID);
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
  const perSegment = _getPerSegmentConfig(segmentationRepresentationUID);

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
  const perSegment = _getPerSegmentConfig(segmentationRepresentationUID);

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
  setSegmentationRepresentationConfig,
  setPerSegmentConfig,
  getPerSegmentConfig,
  // segment index get/set
  setSegmentIndexConfig,
  getSegmentIndexConfig,
};
