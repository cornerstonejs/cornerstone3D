import SegmentationRepresentations from '../../enums/SegmentationRepresentations'
import * as SegmentationState from '../../stateManagement/segmentation/segmentationState'

import {
  RepresentationConfig,
  SegmentationConfig,
} from '../../types/SegmentationStateTypes'

/**
 * It returns the global segmentation config.
 * @returns The global segmentation config containing the representations
 * config for each representation type and renderInactiveSegmentations flag.
 */
function getGlobalSegmentationConfig(): SegmentationConfig {
  const globalConfig = SegmentationState.getGlobalSegmentationConfig()
  return globalConfig
}

/**
 * Set the global segmentation config
 * @param segmentationConfig - SegmentationConfig
 */
function setGlobalSegmentationConfig(
  segmentationConfig: SegmentationConfig
): void {
  SegmentationState.setGlobalSegmentationConfig(segmentationConfig)
}

/**
 * Given a representation type, return the corresponding global representation config
 * @param representationType - The type of representation to query
 * @returns A representation configuration object.
 */
function getGlobalRepresentationConfig(
  representationType: SegmentationRepresentations
): RepresentationConfig {
  const globalConfig = getGlobalSegmentationConfig()
  return globalConfig.representations[representationType]
}

/**
 * Set the global configuration for a given representation type. It fires
 * a SEGMENTATION_GLOBAL_STATE_MODIFIED event.
 *
 * @triggers SEGMENTATION_GLOBAL_STATE_MODIFIED
 * @param representationType - The type of representation to set config for
 * @param config - The configuration for the representation.
 */
function setGlobalRepresentationConfig(
  representationType: SegmentationRepresentations,
  config: RepresentationConfig
): void {
  const globalConfig = getGlobalSegmentationConfig()

  setGlobalSegmentationConfig({
    ...globalConfig,
    representations: {
      ...globalConfig.representations,
      [representationType]: config,
    },
  })
}

/**
 * It takes a representation type and a partial representation config, and updates
 * the global representation config with the partial config. It fires a
 * SEGMENTATION_GLOBAL_STATE_MODIFIED event.
 *
 * @triggers SEGMENTATION_GLOBAL_STATE_MODIFIED
 * @param representationType - The type of representation to update.
 * @param config - Partial<RepresentationConfig>
 */
function updateGlobalRepresentationConfig(
  representationType: SegmentationRepresentations,
  config: Partial<RepresentationConfig>
): void {
  const representationConfig = getGlobalRepresentationConfig(representationType)

  setGlobalRepresentationConfig(representationType, {
    ...representationConfig,
    ...config,
  })
}

/**
 * It takes a partial config object and updates the global config with it
 * @param config - Partial<SegmentationConfig>
 */
function updateGlobalSegmentationConfig(
  config: Partial<SegmentationConfig>
): void {
  const globalConfig = getGlobalSegmentationConfig()

  setGlobalSegmentationConfig({
    ...globalConfig,
    ...config,
  })
}

/**
 * Get the toolGroup specific segmentation config
 * @param toolGroupId - The Id of the tool group
 * @returns A SegmentationConfig object.
 */
function getSegmentationConfig(toolGroupId: string): SegmentationConfig {
  return SegmentationState.getSegmentationConfig(toolGroupId)
}

/**
 * Set the toolGroup specific segmentation config.
 * It fires a SEGMENTATION_STATE_MODIFIED event.
 *
 * @param toolGroupId - The Id of the tool group that the segmentation config is for.
 * @param segmentationConfig - The segmentation config to set.
 */
function setSegmentationConfig(
  toolGroupId: string,
  segmentationConfig: SegmentationConfig
): void {
  SegmentationState.setSegmentationConfig(toolGroupId, segmentationConfig)
}

/**
 * Set the representation config for a given tool group for the given representation type.
 * It fires a SEGMENTATION_STATE_MODIFIED event.
 *
 * @param toolGroupId - The unique identifier of the tool group.
 * @param representationType - The type of representation to set config for.
 * @param representationConfig - The configuration for the representation.
 */
function setRepresentationConfig(
  toolGroupId: string,
  representationType: SegmentationRepresentations,
  representationConfig: RepresentationConfig
): void {
  const segmentationConfig =
    SegmentationState.getSegmentationConfig(toolGroupId)

  if (segmentationConfig) {
    const config = {
      ...segmentationConfig,
      representations: {
        ...segmentationConfig.representations,
        [representationType]: representationConfig,
      },
    }

    setSegmentationConfig(toolGroupId, config)
  }
}

/**
 * Get the representation config for a given tool group and representation type
 * @param toolGroupId - The Id of the tool group that contains the tool that you
 * want to get the representation config for.
 * @param representationType - The type of representation to get.
 * @returns A RepresentationConfig object.
 */
function getRepresentationConfig(
  toolGroupId: string,
  representationType: SegmentationRepresentations
): RepresentationConfig {
  const segmentationConfig = getSegmentationConfig(toolGroupId)

  if (segmentationConfig) {
    return segmentationConfig.representations[representationType]
  }
}

export {
  getGlobalSegmentationConfig,
  setGlobalSegmentationConfig,
  getGlobalRepresentationConfig,
  setGlobalRepresentationConfig,
  updateGlobalSegmentationConfig,
  updateGlobalRepresentationConfig,
  getSegmentationConfig,
  setSegmentationConfig,
  setRepresentationConfig,
  getRepresentationConfig,
}

export default {
  getGlobalSegmentationConfig,
  setGlobalSegmentationConfig,
  getGlobalRepresentationConfig,
  setGlobalRepresentationConfig,
  updateGlobalSegmentationConfig,
  updateGlobalRepresentationConfig,
  getSegmentationConfig,
  setSegmentationConfig,
  setRepresentationConfig,
  getRepresentationConfig,
}
