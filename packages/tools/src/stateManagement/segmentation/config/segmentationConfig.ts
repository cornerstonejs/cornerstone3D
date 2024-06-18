import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';

import {
  RepresentationConfig,
  SegmentationRepresentationConfig,
  SegmentSpecificRepresentationConfig,
} from '../../../types/SegmentationStateTypes';

/**
 * It returns the global segmentation config.
 * @returns The global segmentation config containing the representations
 * config for each representation type and renderInactiveSegmentations flag.
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
 * Give the segmentation representation UID, return the corresponding config
 * which is shared by all segments in the segmentation representation.
 *
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @returns - The configuration for the representation.
 */
function getSegmentationRepresentationConfig(
  segmentationRepresentationUID: string
): RepresentationConfig {
  return SegmentationState.getSegmentationRepresentationConfig(
    segmentationRepresentationUID
  );
}

/**
 * Set the segmentation representation specific configuration for the
 * segmentation representation. This will apply to all segments in the
 * segmentation representation.
 *
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @param config - The configuration for the representation. This is an object
 * only containing the representation type as key and the config as value.
 */
function setSegmentationRepresentationConfig(
  segmentationRepresentationUID: string,
  config: RepresentationConfig
): void {
  SegmentationState.setSegmentationRepresentationConfig(
    segmentationRepresentationUID,
    config
  );
}

/**
 * Get the segment specific configuration for the segmentation representation.
 *
 * @param segmentationRepresentationUID  - The uid of the segmentation representation
 * @param segmentIndex - The index of the segment
 * @returns - The configuration for the segment index in the segmentation representation
 */
function getSegmentSpecificConfig(
  segmentationRepresentationUID: string,
  segmentIndex: number
): RepresentationConfig {
  return SegmentationState.getSegmentSpecificConfig(
    segmentationRepresentationUID,
    segmentIndex
  );
}

/**
 * Set the segment specific configuration for the segmentation representation.
 * This configuration, if specified, has higher priority than the segmentation representation specific config.
 * The order of priority is: segment specific config > segmentation representation specific config > global config
 *
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @param segmentIndex - The index of the segment
 * @param config - The configuration for the representation. This is an object
 */
function setSegmentSpecificConfig(
  segmentationRepresentationUID: string,
  config: SegmentSpecificRepresentationConfig
): void {
  SegmentationState.setSegmentSpecificConfig(
    segmentationRepresentationUID,
    config
  );
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
  // segment specific config
  getSegmentSpecificConfig,
  setSegmentSpecificConfig,
};
