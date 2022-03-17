import { defaultSegmentationStateManager } from './SegmentationStateManager'
import {
  triggerSegmentationStateModified,
  triggerSegmentationGlobalStateModified,
} from '../../store/SegmentationModule'
import {
  GlobalSegmentationState,
  GlobalSegmentationData,
  ColorLUT,
  ToolGroupSpecificSegmentationState,
  ToolGroupSpecificSegmentationData,
  SegmentationConfig,
} from '../../types/SegmentationStateTypes'

import {
  getDefaultRepresentationConfig,
  isValidRepresentationConfig,
} from '../../utilities/segmentation'
import { deepMerge } from '../../utilities'

/**
 * It returns the defaultSegmentationStateManager.
 */
function getDefaultSegmentationStateManager() {
  return defaultSegmentationStateManager
}

/*************************
 *
 * GLOBAL STATE
 *
 **************************/

/**
 * Get the global segmentation data for a given segmentation UID
 * @param segmentationUID - The UID of the segmentation to get the global
 * data for.
 * @returns A GlobalSegmentationData object
 */
function getGlobalSegmentationDataByUID(
  segmentationUID: string
): GlobalSegmentationData {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getGlobalSegmentationData(segmentationUID)
}

/**
 * Add a new global segmentation data to the segmentation state manager, and
 * triggers SEGMENTATION_STATE_MODIFIED event if not suppressed.
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
    triggerSegmentationGlobalStateModified(segmentationData.volumeUID)
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
 * Get the segmentation state for a tool group. It will return an array of
 * segmentation data objects.
 * @param toolGroupUID - The unique identifier of the tool group.
 * @returns An array of segmentation data objects.
 */
function getSegmentationState(
  toolGroupUID: string
): ToolGroupSpecificSegmentationState | [] {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getSegmentationState(toolGroupUID)
}

/**
 * Get the segmentation data object for a given tool group and
 * segmentation data UID. It searches all the toolGroup specific segmentation
 * data objects and returns the first one that matches the UID.
 * @param toolGroupUID - The UID of the tool group that the segmentation
 * data belongs to.
 * @param segmentationDataUID - The UID of the segmentation data to
 * retrieve.
 * @returns Segmentation Data object.
 */
function getSegmentationDataByUID(
  toolGroupUID: string,
  segmentationDataUID: string
): ToolGroupSpecificSegmentationData | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getSegmentationDataByUID(
    toolGroupUID,
    segmentationDataUID
  )
}

/**
 * Remove a segmentation data from the segmentation state manager for a toolGroup.
 * It fires SEGMENTATION_STATE_MODIFIED event.
 *
 * @triggers SEGMENTATION_STATE_MODIFIED
 *
 * @param toolGroupUID - The UID of the tool group that the segmentation
 * data belongs to.
 * @param segmentationDataUID - The UID of the segmentation data to
 * remove.
 */
function removeSegmentationData(
  toolGroupUID: string,
  segmentationDataUID: string
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.removeSegmentationData(
    toolGroupUID,
    segmentationDataUID
  )

  triggerSegmentationStateModified(toolGroupUID)
}

/**
 * Add the given segmentation data to the given tool group state. It fires
 * SEGMENTATION_STATE_MODIFIED event if not suppressed.
 *
 * @triggers SEGMENTATION_STATE_MODIFIED
 *
 * @param toolGroupUID - The UID of the tool group that the segmentation data is for.
 * @param segmentationData - The data to add to the segmentation state.
 * @param suppressEvents - boolean
 */
function addSegmentationData(
  toolGroupUID: string,
  segmentationData: ToolGroupSpecificSegmentationData,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  _initGlobalStateIfNecessary(segmentationStateManager, segmentationData)

  segmentationStateManager.addSegmentationData(toolGroupUID, segmentationData)

  if (!suppressEvents) {
    triggerSegmentationStateModified(toolGroupUID)
  }
}

/***************************
 *
 * Global Configuration
 *
 ***************************/

/**
 * It returns the global segmentation config. Note that the toolGroup-specific
 * configuration has higher priority than the global configuration and overwrites
 * the global configuration for each representation.
 * @returns The global segmentation configuration for all segmentations.
 */
function getGlobalSegmentationConfig(): SegmentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getGlobalSegmentationConfig()
}

/**
 * Set the global segmentation configuration. It fires SEGMENTATION_GLOBAL_STATE_MODIFIED
 * event if not suppressed.
 *
 * @triggers SEGMENTATION_GLOBAL_STATE_MODIFIED
 * @param config - The new global segmentation config.
 * @param suppressEvents - If true, the `segmentationGlobalStateModified` event will not be triggered.
 */
function setGlobalSegmentationConfig(
  config: SegmentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.setGlobalSegmentationConfig(config)

  if (!suppressEvents) {
    triggerSegmentationGlobalStateModified()
  }
}

/***************************
 *
 * ToolGroup Specific Configuration
 *
 ***************************/

/**
 * Set the segmentation config for the provided toolGroup. ToolGroup specific
 * configuration overwrites the global configuration for each representation.
 * It fires SEGMENTATION_STATE_MODIFIED event if not suppressed.
 *
 * @triggers SEGMENTATION_STATE_MODIFIED
 * @param toolGroupUID - The UID of the tool group that the segmentation
 * config is being set for.
 * @param config - The new configuration for the tool group.
 * @param suppressEvents - If true, the event will not be triggered.
 */
function setSegmentationConfig(
  toolGroupUID: string,
  config: SegmentationConfig,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.setSegmentationConfig(toolGroupUID, config)

  if (!suppressEvents) {
    triggerSegmentationStateModified(toolGroupUID)
  }
}

/**
 * Get the segmentation config for a given tool group which contains each
 * segmentation representation configuration.
 * @param toolGroupUID - The UID of the tool group that the segmentation
 * config belongs to.
 * @returns A SegmentationConfig object.
 */
function getSegmentationConfig(toolGroupUID: string): SegmentationConfig {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getSegmentationConfig(toolGroupUID)
}

/***************************
 *
 * Utilities
 *
 ***************************/

/**
 * Get the tool group UIDs that have a segmentation with the given UID
 * @param segmentationUID - The UID of the segmentation to get the tool
 * groups for.
 * @returns An array of tool group UIDs.
 */
function getToolGroupsWithSegmentation(segmentationUID: string): string[] {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getToolGroupsWithSegmentation(segmentationUID)
}

/**
 * Get the list of all tool groups currently in the segmentation state manager.
 * @returns An array of tool group UIDs.
 */
function getToolGroups(): string[] {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getToolGroups()
}

/**
 * Get the color lut for a given index
 * @param index - The index of the color lut to retrieve.
 * @returns A ColorLUT array.
 */
function getColorLut(index: number): ColorLUT | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  return segmentationStateManager.getColorLut(index)
}

/**
 * Add a color LUT to the segmentation state manager
 * @param colorLut - The color LUT array to add.
 * @param index - The index of the color LUT to add.
 */
function addColorLut(colorLut: ColorLUT, index: number): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.addColorLut(colorLut, index)
  // Todo: trigger event color LUT added
}

/**
 * Set the active segmentation data for a tool group. It searches the segmentation
 * state of the toolGroup and sets the active segmentation data to the one with
 * the given UID. It fires SEGMENTATION_STATE_MODIFIED event if not suppressed.
 *
 * @triggers SEGMENTATION_STATE_MODIFIED
 *
 * @param toolGroupUID - The UID of the tool group that owns the segmentation data.
 * @param segmentationDataUID - The UID of the segmentation data to set as active.
 * @param suppressEvents - If true, the segmentation state will be updated, but no events will be triggered.
 */
function setActiveSegmentationData(
  toolGroupUID: string,
  segmentationDataUID: string,
  suppressEvents?: boolean
): void {
  const segmentationStateManager = getDefaultSegmentationStateManager()
  segmentationStateManager.setActiveSegmentationData(
    toolGroupUID,
    segmentationDataUID
  )

  if (!suppressEvents) {
    triggerSegmentationStateModified(toolGroupUID)
  }
}

/**
 * Get the active segmentation data for a given tool group by searching the
 * segmentation state of the tool group and returning the segmentation data with
 * the given UID.
 *
 * @param toolGroupUID - The UID of the tool group that the segmentation
 * data belongs to.
 * @returns The active segmentation data for the tool group.
 */
function getActiveSegmentationData(
  toolGroupUID: string
): ToolGroupSpecificSegmentationData | undefined {
  const segmentationStateManager = getDefaultSegmentationStateManager()

  const toolGroupSegmentations =
    segmentationStateManager.getSegmentationState(toolGroupUID)

  if (toolGroupSegmentations.length === 0) {
    return
  }

  const activeSegmentationData = toolGroupSegmentations.find(
    (segmentationData: ToolGroupSpecificSegmentationData) =>
      segmentationData.active
  )

  return activeSegmentationData
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
  const globalSegmentationData = getGlobalSegmentationDataByUID(
    segmentationData.volumeUID
  )
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
    const { volumeUID } = segmentationData

    const defaultGlobalData: GlobalSegmentationData = {
      volumeUID: volumeUID,
      label: volumeUID,
      referenceVolumeUID: null,
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
    triggerSegmentationGlobalStateModified(segmentationData.volumeUID)
  }
}

export {
  // config
  getGlobalSegmentationConfig,
  getSegmentationConfig,
  setGlobalSegmentationConfig,
  setSegmentationConfig,
  // colorLUT
  addColorLut,
  getColorLut,
  // get/set global state
  getGlobalSegmentationState,
  getGlobalSegmentationDataByUID,
  addGlobalSegmentationData,
  // toolGroup state
  getSegmentationState,
  addSegmentationData,
  removeSegmentationData,
  getSegmentationDataByUID,
  setActiveSegmentationData,
  getActiveSegmentationData,
  getToolGroupsWithSegmentation,
  getToolGroups,
  // Utility
  getDefaultSegmentationStateManager,
}
