import { defaultSegmentationStateManager } from './SegmentationStateManager'
import {
  triggerSegmentationRepresentationModified,
  triggerSegmentationModified,
} from './triggerSegmentationEvents'
import type {
  ColorLut,
  Segmentation,
  SegmentationPublicInput,
  SegmentationRepresentationConfig,
  ToolGroupSpecificRepresentation,
} from '../../types/SegmentationStateTypes'

import {
  getDefaultRepresentationConfig,
  isValidRepresentationConfig,
} from '../../utilities/segmentation'
import { deepMerge } from '../../utilities'
import normalizeSegmentationInput from './helpers/normalizeSegmentationInput'

/**
 * It returns the defaultSegmentationStateManager.
 */
function getDefaultSegmentationStateManager() {
  return defaultSegmentationStateManager
}

/*************************
 *
 * Segmentation State
 *
 **************************/

/**
 * Get the segmentation for the given segmentationId
 * @param segmentationId - The Id of the segmentation
 * @returns A GlobalSegmentationData object
 */
function getSegmentation(segmentationId: string): Segmentation | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getSegmentation(segmentationId)
}

/**
 * Get the segmentations inside the state
 * @returns Segmentation array
 */
function getSegmentations(): Segmentation[] | [] {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  const state = segmentationStateManager.getState()

  return state.segmentations
}

/**
 * It takes a segmentation input and adds it to the segmentation state manager
 * @param segmentationInput - The segmentation to add.
 * @param suppressEvents - If true, the event will not be triggered.
 */
function addSegmentation(
  segmentationInput: SegmentationPublicInput,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()

  const segmentation = normalizeSegmentationInput(segmentationInput)
  _initializeDefaultConfig(segmentation)

  segmentationStateManager.addSegmentation(segmentation)

  if (!suppressEvents) {
    triggerSegmentationModified(segmentation.segmentationId)
  }
}

/**
 * Get the segmentation state for a tool group. It will return an array of
 * segmentation data objects.
 * @param toolGroupId - The unique identifier of the tool group.
 * @returns An array of segmentation data objects.
 */
function getSegmentationRepresentations(
  toolGroupId: string
): ToolGroupSpecificRepresentation[] | [] {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getSegmentationRepresentations(toolGroupId)
}

/**
 * Get the tool group IDs that have a segmentation representation with the given
 * segmentationId
 * @param segmentationId - The id of the segmentation
 * @returns An array of tool group IDs.
 */
function getToolGroupsWithSegmentation(segmentationId: string): string[] {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  const state = segmentationStateManager.getState()
  const toolGroupIds = Object.keys(state.toolGroups)

  const foundToolGroupIds = []
  toolGroupIds.forEach((toolGroupId) => {
    const toolGroupSegmentationRepresentations =
      segmentationStateManager.getSegmentationRepresentations(toolGroupId)

    toolGroupSegmentationRepresentations.forEach((representation) => {
      if (representation.segmentationId === segmentationId) {
        foundToolGroupIds.push(toolGroupId)
      }
    })
  })

  return foundToolGroupIds
}

/**
 * Get the segmentation representations config for a given tool group
 * @param toolGroupId - The Id of the tool group that the segmentation
 * config belongs to.
 * @returns A SegmentationConfig object.
 */
function getToolGroupSpecificConfig(
  toolGroupId: string
): SegmentationRepresentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getToolGroupSpecificConfig(toolGroupId)
}

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
function setToolGroupConfig(
  toolGroupId: string,
  config: SegmentationRepresentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.setSegmentationRepresentationConfig(
    toolGroupId,
    config
  )

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(toolGroupId)
  }
}

/**
 * Add the given segmentation representation data to the given tool group state. It fires
 * SEGMENTATION_REPRESENTATION_MODIFIED event if not suppressed.
 *
 * @triggers SEGMENTATION_REPRESENTATION_MODIFIED
 *
 * @param toolGroupId - The Id of the tool group that the segmentation data is for.
 * @param segmentationData - The data to add to the segmentation state.
 * @param suppressEvents - boolean
 */
function addSegmentationRepresentation(
  toolGroupId: string,
  segmentationRepresentation: ToolGroupSpecificRepresentation,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.addSegmentationRepresentation(
    toolGroupId,
    segmentationRepresentation
  )

  if (!suppressEvents) {
    triggerSegmentationRepresentationModified(
      toolGroupId,
      segmentationRepresentation.segmentationRepresentationUID
    )
  }
}

/**
 * It returns the global segmentation config. Note that the toolGroup-specific
 * configuration has higher priority than the global configuration and overwrites
 * the global configuration for each representation.
 * @returns The global segmentation configuration for all segmentations.
 */
function getGlobalConfig(): SegmentationRepresentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getGlobalConfig()
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
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.setGlobalConfig(config)

  if (!suppressEvents) {
    triggerSegmentationModified()
  }
}

/**
 * Get the active segmentation data for a given tool group by searching the
 * segmentation state of the tool group and returning the segmentation data with
 * the given UID.
 *
 * @param toolGroupId - The Id of the tool group that the segmentation
 * data belongs to.
 * @returns The active segmentation data for the tool group.
 */
function getActiveSegmentationRepresentation(
  toolGroupId: string
): ToolGroupSpecificRepresentation | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager()

  const toolGroupSegmentationRepresentations =
    segmentationStateManager.getSegmentationRepresentations(toolGroupId)

  if (toolGroupSegmentationRepresentations.length === 0) {
    return
  }

  const activeRepresentation = toolGroupSegmentationRepresentations.find(
    (representation) => representation.active
  )

  return activeRepresentation
}

/**
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *  Correct
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 *
 */

/**
 * Add a new global segmentation data to the segmentation state manager, and
 * triggers SEGMENTATION_REPRESENTATION_MODIFIED event if not suppressed.
 *
 * @param  segmentationData - The data to add to the global segmentation state
 * @param  suppressEvents - If true, the event will not be triggered.
 */
function addGlobalSegmentationData(
  segmentationData: GlobalSegmentationData,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.addGlobalSegmentationData(segmentationData)

  if (!suppressEvents) {
    triggerSegmentationModified(segmentationData.volumeId)
  }
}

/**
 * Get all global segmentation states, which includes array of all global
 * segmentation data.
 * @returns An array of objects, each of which represents a global segmentation
 * data.
 */
function getGlobalSegmentationState(): GlobalSegmentationState | [] {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getGlobalSegmentationState()
}

/***************************
 *
 * ToolGroup Specific State
 *
 ***************************/

/**
 * Get the segmentation data object for a given tool group and
 * segmentation data UID. It searches all the toolGroup specific segmentation
 * data objects and returns the first one that matches the UID.
 * @param toolGroupId - The Id of the tool group that the segmentation
 * data belongs to.
 * @param segmentationDataUID - The id of the segmentation data to
 * retrieve.
 * @returns Segmentation Data object.
 */
function getSegmentationDataByUID(
  toolGroupId: string,
  segmentationDataUID: string
): ToolGroupSpecificSegmentationData | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getSegmentationDataByUID(
    toolGroupId,
    segmentationDataUID
  )
}

/**
 * Remove a segmentation data from the segmentation state manager for a toolGroup.
 * It fires SEGMENTATION_REPRESENTATION_MODIFIED event.
 *
 * @triggers SEGMENTATION_REPRESENTATION_MODIFIED
 *
 * @param toolGroupId - The Id of the tool group that the segmentation
 * data belongs to.
 * @param segmentationDataUID - The id of the segmentation data to
 * remove.
 */
function removeSegmentationData(
  toolGroupId: string,
  segmentationDataUID: string
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.removeSegmentationData(
    toolGroupId,
    segmentationDataUID
  )

  triggerSegmentationRepresentationModified(toolGroupId)
}

/***************************
 *
 * Global Configuration
 *
 ***************************/

/***************************
 *
 * ToolGroup Specific Configuration
 *
 ***************************/

/***************************
 *
 * Utilities
 *
 ***************************/

/**
 * Get the list of all tool groups currently in the segmentation state manager.
 * @returns An array of tool group IDs.
 */
function getToolGroups(): string[] {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getToolGroups()
}

/**
 * Get the color lut for a given index
 * @param index - The index of the color lut to retrieve.
 * @returns A ColorLut array.
 */
function getColorLut(index: number): ColorLut | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getColorLut(index)
}

/**
 * Add a color LUT to the segmentation state manager
 * @param colorLut - The color LUT array to add.
 * @param index - The index of the color LUT to add.
 */
function addColorLUT(colorLut: ColorLut, index: number): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.addColorLUT(colorLut, index)
  // Todo: trigger event color LUT added
}

function _initializeDefaultConfig(segmentation: Segmentation) {
  const suppressEvents = true
  const defaultConfig = getDefaultRepresentationConfig(segmentation)

  const newGlobalConfig: SegmentationRepresentationConfig = {
    renderInactiveSegmentations: true,
    representations: {
      [segmentation.type]: defaultConfig,
    },
  }
  setGlobalConfig(newGlobalConfig, suppressEvents)
}

/**
 * If no global state exists, it create a default one and If the global config
 * is not valid, create a default one
 *
 * @param segmentationStateManager - The state manager for the segmentation.
 * @param segmentationData - The segmentation data that we want to add to the
 * global state.
 */
function _initGlobalStateIfNecessary(
  segmentationStateManager,
  segmentationData
) {
  const globalSegmentationData = getSegmentation(segmentationData.volumeId)
  // for the representation, if no global config exists, create default one
  const {
    representation: { type: representationType },
  } = segmentationData

  const globalConfig = getGlobalSegmentationConfig()
  const globalRepresentationConfig =
    globalConfig.representations[representationType]
  const validConfig = isValidRepresentationConfig(
    representationType,
    globalRepresentationConfig
  )

  // If global segmentationData is not found, or if the global config is not
  // valid, we use default values to create both, but we need to only
  // fire the event for global state modified once, so we suppress each events.
  const suppressEvents = !globalSegmentationData || !validConfig

  // if no global state exists, create a default one
  if (!globalSegmentationData) {
    const { volumeId } = segmentationData

    const defaultGlobalData: GlobalSegmentationData = {
      volumeId: volumeId,
      label: volumeId,
      referenceVolumeId: null,
      cachedStats: {},
      referenceImageId: null,
      activeSegmentIndex: 1,
      segmentsLocked: new Set(),
    }

    addGlobalSegmentationData(defaultGlobalData, suppressEvents)
  }

  // Todo: we can check the validity of global config for each representation
  // when we are setting it up at the setGlobalSegmentationConfig function, not here
  if (!validConfig) {
    // create default config
    const defaultRepresentationConfig =
      getDefaultRepresentationConfig(representationType)

    const mergedRepresentationConfig = deepMerge(
      defaultRepresentationConfig,
      globalRepresentationConfig
    )

    const newGlobalConfig = {
      ...globalConfig,
      representations: {
        ...globalConfig.representations,
        [representationType]: mergedRepresentationConfig,
      },
    }

    setGlobalSegmentationConfig(newGlobalConfig, suppressEvents)
  }

  // If we have suppressed events, means that we have created a new global state
  // and/or a new default config for the representation, so we need to trigger
  // the event to notify the listeners.
  if (suppressEvents) {
    triggerSegmentationModified(segmentationData.volumeId)
  }
}

export {
  // state manager
  getDefaultSegmentationStateManager,
  // Segmentation
  getSegmentation,
  getSegmentations,
  addSegmentation,
  // ToolGroup specific Segmentation Representation
  getSegmentationRepresentations,
  addSegmentationRepresentation,
  // config
  getToolGroupSpecificConfig,
  setToolGroupConfig,
  getGlobalConfig,
  setGlobalConfig,
  // helpers
  getToolGroupsWithSegmentation,
  // color
  addColorLUT,
  getColorLut,
  // getGlobalSegmentationConfig,
  // getSegmentationConfig,
  // setGlobalSegmentationConfig,
  // setSegmentationConfig,
  // colorLUT
  // get/set global state
  // getGlobalSegmentationState,
  // addGlobalSegmentationData,
  // toolGroup state
  // getSegmentationRepresentations,
  // addSegmentationData,
  // removeSegmentationData,
  // getSegmentationDataByUID,
  // setActiveSegmentationData,
  // getActiveSegmentationData,
  // getToolGroupsWithSegmentation,
  // getToolGroups,
  // Utility
  // getDefaultSegmentationStateManager,
}
