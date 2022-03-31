import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';

import {
  RepresentationConfig,
  SegmentationRepresentationConfig,
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
      [representationType]: config,
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

function setToolGroupSpecificConfig(
  toolGroupId: string,
  segmentationRepresentationConfig: SegmentationRepresentationConfig
): void {
  SegmentationState.setToolGroupSpecificConfig(
    toolGroupId,
    segmentationRepresentationConfig
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
};
