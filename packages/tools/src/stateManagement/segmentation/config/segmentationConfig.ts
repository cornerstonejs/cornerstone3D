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
 * Get the toolGroup specific segmentation config
 * @param toolGroupId - The Id of the tool group
 * @returns A SegmentationConfig object.
 */
function getToolGroupSpecificConfig(
  toolGroupId: string
): SegmentationRepresentationConfig {
  return SegmentationState.getToolGroupSpecificConfig(toolGroupId);
}

/**
 * Sets the tool group specific configuration for the segmentation
 * representation. This will apply to all segmentation representations.
 * @param toolGroupId - The tool group id where the segmentation representation belongs to.
 * @param segmentationRepresentationConfig - This is the configuration object that you will use to set the default values for
 * the segmentation representation.
 */
function setToolGroupSpecificConfig(
  toolGroupId: string,
  segmentationRepresentationConfig: SegmentationRepresentationConfig
): void {
  SegmentationState.setToolGroupSpecificConfig(
    toolGroupId,
    segmentationRepresentationConfig
  );
}

/**
 * Give the segmentation representation UID, return the corresponding config
 * which is shared by all segments in the segmentation representation. This is
 * an optional level of configuration that can be set by the user, by default
 * it will fallback to the toolGroup specific config, if not set, it will fallback
 * to the global config.
 *
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @param config - The configuration for the representation. This is an object
 * only containing the representation type as key and the config as value.
 * @returns - The configuration for the representation.
 */
function getSegmentationRepresentationSpecificConfig(
  toolGroupId: string,
  segmentationRepresentationUID: string
): RepresentationConfig {
  return SegmentationState.getSegmentationRepresentationSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID
  );
}

/**
 * Set the segmentation representation specific configuration for the
 * segmentation representation. This will apply to all segments in the
 * segmentation representation and has higher priority than the toolGroup
 * specific config.
 *
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @param config - The configuration for the representation. This is an object
 * only containing the representation type as key and the config as value.
 */
function setSegmentationRepresentationSpecificConfig(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  config: RepresentationConfig
): void {
  SegmentationState.setSegmentationRepresentationSpecificConfig(
    toolGroupId,
    segmentationRepresentationUID,
    config
  );
}

/**
 * Get the segment specific configuration for the segmentation representation.
 *
 * @param toolGroupId - The tool group id where the segmentation representation belongs to.
 * @param segmentationRepresentationUID  - The uid of the segmentation representation
 * @param segmentIndex - The index of the segment
 * @returns - The configuration for the segment index in the segmentation representation that is shown in the toolGroup's viewport
 */
function getSegmentSpecificConfig(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number
): RepresentationConfig {
  return SegmentationState.getSegmentSpecificRepresentationConfig(
    toolGroupId,
    segmentationRepresentationUID,
    segmentIndex
  );
}

/**
 * Set the segment specific configuration for the segmentation representation.
 * This configuration, if specified, has higher priority than the segmentation representation specific config,
 * and the toolGroup specific config. The order of priority is: segment specific config > segmentation representation specific config > toolGroup specific config > global config
 * @param toolGroupId - The tool group id where the segmentation representation belongs to.
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @param segmentIndex - The index of the segment
 * @param config - The configuration for the representation. This is an object
 */
function setSegmentSpecificConfig(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  config: SegmentSpecificRepresentationConfig
): void {
  SegmentationState.setSegmentSpecificRepresentationConfig(
    toolGroupId,
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
  // ToolGroup Specific
  getToolGroupSpecificConfig,
  setToolGroupSpecificConfig,
  // segmentation representation specific config
  getSegmentationRepresentationSpecificConfig,
  setSegmentationRepresentationSpecificConfig,
  // segment specific config
  getSegmentSpecificConfig,
  setSegmentSpecificConfig,
};
