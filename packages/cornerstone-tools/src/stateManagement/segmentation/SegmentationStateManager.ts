import cloneDeep from 'lodash.clonedeep'
import { utilities as csUtils } from '@cornerstonejs/core'

import CORNERSTONE_COLOR_LUT from './helpers/COLOR_LUT'

import {
  SegmentationState,
  GlobalSegmentationState,
  GlobalSegmentationData,
  ColorLUT,
  ToolGroupSpecificSegmentationData,
  ToolGroupSpecificSegmentationState,
  SegmentationConfig,
} from '../../types/SegmentationStateTypes'

/* A default initial state for the segmentation manager. */
const initialDefaultState = {
  colorLutTables: [],
  global: {
    segmentations: [],
    config: {
      renderInactiveSegmentations: true,
      representations: {},
    },
  },
  toolGroups: {},
}

/**
 * The SegmentationStateManager Class is responsible for managing the state of the
 * segmentations. It stores a global state and a toolGroup specific state.
 * In global state it stores the global configuration of each segmentation,
 * but in toolGroup specific state it stores the toolGroup specific configuration
 * which will override the global configuration.
 *
 * Note that this is a singleton state manager.
 */
export default class SegmentationStateManager {
  private state: SegmentationState
  public readonly uid: string

  constructor(uid?: string) {
    if (!uid) {
      uid = csUtils.uuidv4()
    }
    this.state = cloneDeep(initialDefaultState)
    this.uid = uid
  }

  /**
   * It returns a copy of the current state of the segmentation
   * @returns A deep copy of the state.
   */
  getState(): SegmentationState {
    return cloneDeep(this.state)
  }

  /**
   * It returns an array of toolGroupUIDs currently in the segmentation state.
   * @returns An array of strings.
   */
  getToolGroups(): string[] {
    return Object.keys(this.state.toolGroups)
  }

  /**
   * It returns the colorLut at the specified index.
   * @param lutIndex - The index of the color LUT to retrieve.
   * @returns A ColorLUT object.
   */
  getColorLut(lutIndex: number): ColorLUT | undefined {
    return this.state.colorLutTables[lutIndex]
  }

  /**
   * Reset the state to the default state
   */
  resetState(): void {
    this.state = cloneDeep(initialDefaultState)
  }

  /**
   * Given a segmentation UID, return the global segmentation data for that
   * segmentation
   * @param segmentationUID - The UID of the segmentation to get the
   * global data for.
   * @returns - The global segmentation data for the
   * segmentation with the given UID.
   */
  getGlobalSegmentationData(
    segmentationUID: string
  ): GlobalSegmentationData | undefined {
    return this.state.global.segmentations?.find(
      (segmentationState) => segmentationState.volumeUID === segmentationUID
    )
  }

  /**
   * Get the global segmentation state for all the segmentations in the
   * segmentation state manager.
   * @returns An array of GlobalSegmentationData.
   */
  getGlobalSegmentationState(): GlobalSegmentationState | [] {
    return this.state.global.segmentations
  }

  /**
   * Get the global config containing both representation config
   * and render inactive segmentations config
   * @returns The global config object.
   */
  getGlobalSegmentationConfig(): SegmentationConfig {
    return this.state.global.config
  }

  /**
   * It sets the global segmentation config including both representation config
   * and render inactive segmentations config
   * @param config - The global configuration for the segmentations.
   */
  setGlobalSegmentationConfig(config: SegmentationConfig): void {
    this.state.global.config = config
  }

  /**
   * Given a segmentation UID, return a list of tool group UIDs that have that
   * segmentation in their segmentation state (segmentation has been added
   * to the tool group).
   * @param segmentationUID - The UID of the segmentation volume.
   * @returns An array of toolGroupUIDs.
   */
  getToolGroupsWithSegmentation(segmentationUID: string): string[] {
    const toolGroupUIDs = Object.keys(this.state.toolGroups)

    const foundToolGroupUIDs = []
    toolGroupUIDs.forEach((toolGroupUID) => {
      const toolGroupSegmentationState = this.getSegmentationState(
        toolGroupUID
      ) as ToolGroupSpecificSegmentationState

      const segmentationData = toolGroupSegmentationState.find(
        (segmentationData) => segmentationData.volumeUID === segmentationUID
      )

      if (segmentationData) {
        foundToolGroupUIDs.push(toolGroupUID)
      }
    })

    return foundToolGroupUIDs
  }

  /**
   * Get the segmentation state for the toolGroup containing array of
   * segmentation data objects.
   *
   * @param toolGroupUID - The UID of the tool group that the segmentation
   * belongs to.
   * @returns An array of objects, each of which contains the data for a single
   * segmentation data
   */
  getSegmentationState(
    toolGroupUID: string
  ): ToolGroupSpecificSegmentationState | [] {
    const toolGroupSegmentationState = this.state.toolGroups[toolGroupUID]

    if (!toolGroupSegmentationState) {
      return []
    }

    return this.state.toolGroups[toolGroupUID].segmentations
  }

  /**
   * Given a tool group UID and a representation type, return toolGroup specific
   * config for that representation type.
   *
   * @param toolGroupUID - The UID of the tool group
   * @param representationType - The type of representation, currently only Labelmap
   * @returns A SegmentationConfig object.
   */
  getSegmentationConfig(toolGroupUID: string): SegmentationConfig | undefined {
    const toolGroupStateWithConfig = this.state.toolGroups[toolGroupUID]

    if (!toolGroupStateWithConfig) {
      return
    }

    return toolGroupStateWithConfig.config
  }

  /**
   * Set the segmentation config for a given tool group. It will create a new
   * tool group specific config if one does not exist.
   *
   * @param toolGroupUID - The UID of the tool group that the segmentation
   * belongs to.
   * @param config - SegmentationConfig
   */
  setSegmentationConfig(
    toolGroupUID: string,
    config: SegmentationConfig
  ): void {
    let toolGroupStateWithConfig = this.state.toolGroups[toolGroupUID]

    if (!toolGroupStateWithConfig) {
      this.state.toolGroups[toolGroupUID] = {
        segmentations: [],
        config: {
          renderInactiveSegmentations: true,
          representations: {},
        },
      }

      toolGroupStateWithConfig = this.state.toolGroups[toolGroupUID]
    }

    toolGroupStateWithConfig.config = {
      ...toolGroupStateWithConfig.config,
      ...config,
    }
  }

  /**
   * Given a toolGroupUID and a segmentationDataUID, return the segmentation data for that tool group.
   * @param toolGroupUID - The UID of the tool group that the segmentation
   * data belongs to.
   * @param segmentationDataUID - string
   * @returns A ToolGroupSpecificSegmentationData object.
   */
  getSegmentationDataByUID(
    toolGroupUID: string,
    segmentationDataUID: string
  ): ToolGroupSpecificSegmentationData | undefined {
    const toolGroupSegState = this.getSegmentationState(
      toolGroupUID
    ) as ToolGroupSpecificSegmentationState

    const segmentationData = toolGroupSegState.find(
      (segData) => segData.segmentationDataUID === segmentationDataUID
    )

    return segmentationData
  }

  /**
   * Get the active segmentation data for a tool group
   * @param toolGroupUID - The UID of the tool group that the segmentation
   * data belongs to.
   * @returns A ToolGroupSpecificSegmentationData object.
   */
  getActiveSegmentationData(
    toolGroupUID: string
  ): ToolGroupSpecificSegmentationData | undefined {
    const toolGroupSegState = this.getSegmentationState(
      toolGroupUID
    ) as ToolGroupSpecificSegmentationState

    return toolGroupSegState.find((segmentationData) => segmentationData.active)
  }

  /**
   * It adds a color LUT to the state.
   * @param colorLut - ColorLUT
   * @param lutIndex - The index of the color LUT table to add.
   */
  addColorLUT(colorLut: ColorLUT, lutIndex: number): void {
    if (this.state.colorLutTables[lutIndex]) {
      console.log('Color LUT table already exists, overwriting')
    }

    this.state.colorLutTables[lutIndex] = colorLut
  }

  /**
   * It adds a new segmentation to the global segmentation state. It will merge
   * the segmentation data with the existing global segmentation data if it exists.
   * @param segmentationData - GlobalSegmentationData
   */
  addGlobalSegmentationData(segmentationData: GlobalSegmentationData): void {
    const { volumeUID } = segmentationData

    // Creating the default color LUT if not created yet
    this._initDefaultColorLutIfNecessary()

    // Don't allow overwriting existing labelmapState with the same labelmapUID
    const existingGlobalSegmentationData =
      this.getGlobalSegmentationData(volumeUID)

    // merge the new state with the existing state
    const updatedState = {
      ...existingGlobalSegmentationData,
      ...segmentationData,
    }

    // Is there any existing state?
    if (!existingGlobalSegmentationData) {
      this.state.global.segmentations.push({
        volumeUID,
        label: segmentationData.label,
        referenceVolumeUID: segmentationData.referenceVolumeUID,
        cachedStats: segmentationData.cachedStats,
        referenceImageId: segmentationData.referenceImageId,
        activeSegmentIndex: segmentationData.activeSegmentIndex,
        segmentsLocked: segmentationData.segmentsLocked,
      })

      return
    }

    // If there is an existing state, replace it
    const index = this.state.global.segmentations.findIndex(
      (segmentationState) => segmentationState.volumeUID === volumeUID
    )
    this.state.global.segmentations[index] = updatedState
  }

  /**
   * Add a new segmentation data to the toolGroup's segmentation state
   * @param toolGroupUID - The UID of the tool group that the segmentation
   * belongs to.
   * @param segmentationData - ToolGroupSpecificSegmentationData
   */
  addSegmentationData(
    toolGroupUID: string,
    segmentationData: ToolGroupSpecificSegmentationData
  ): void {
    // Initialize the default toolGroup state if not created yet
    if (!this.state.toolGroups[toolGroupUID]) {
      this.state.toolGroups[toolGroupUID] = {
        segmentations: [],
        config: {} as SegmentationConfig,
      }
    }

    // local toolGroupSpecificSegmentationState
    this.state.toolGroups[toolGroupUID].segmentations.push(segmentationData)
    this._handleActiveSegmentation(toolGroupUID, segmentationData)
  }

  /**
   * Set the active segmentation data for a tool group
   * @param toolGroupUID - The UID of the tool group that owns the
   * segmentation data.
   * @param segmentationDataUID - string
   */
  setActiveSegmentationData(
    toolGroupUID: string,
    segmentationDataUID: string
  ): void {
    const toolGroupSegmentations = this.getSegmentationState(toolGroupUID)

    if (!toolGroupSegmentations || !toolGroupSegmentations.length) {
      throw new Error(
        `No segmentation data found for toolGroupUID: ${toolGroupUID}`
      )
    }

    const segmentationData = toolGroupSegmentations.find(
      (segmentationData) =>
        segmentationData.segmentationDataUID === segmentationDataUID
    )

    if (!segmentationData) {
      throw new Error(
        `No segmentation data found for segmentation data UID ${segmentationDataUID}`
      )
    }

    segmentationData.active = true
    this._handleActiveSegmentation(toolGroupUID, segmentationData)
  }

  /**
   * Remove a segmentation data from the toolGroup specific segmentation state
   * @param toolGroupUID - The UID of the tool group that the segmentation
   * data is associated with.
   * @param segmentationDataUID - string
   */
  removeSegmentationData(
    toolGroupUID: string,
    segmentationDataUID: string
  ): void {
    const toolGroupSegmentations = this.getSegmentationState(toolGroupUID)

    if (!toolGroupSegmentations || !toolGroupSegmentations.length) {
      throw new Error(
        `No viewport specific segmentation state found for viewport ${toolGroupUID}`
      )
    }

    const state = toolGroupSegmentations as ToolGroupSpecificSegmentationState
    const index = state.findIndex(
      (segData) => segData.segmentationDataUID === segmentationDataUID
    )

    if (index === -1) {
      console.warn(
        `No viewport specific segmentation state data found for viewport ${toolGroupUID} and segmentation data UID ${segmentationDataUID}`
      )
    }

    const removedSegmentationData = toolGroupSegmentations[index]
    toolGroupSegmentations.splice(index, 1)
    this._handleActiveSegmentation(toolGroupUID, removedSegmentationData)
  }

  /**
   * It handles the active segmentation data based on the active status of the
   * segmentation data that was added or removed.
   *
   * @param toolGroupUID - The UID of the tool group that the segmentation
   * data belongs to.
   * @param recentlyAddedOrRemovedSegmentationData - ToolGroupSpecificSegmentationData
   */
  _handleActiveSegmentation(
    toolGroupUID: string,
    recentlyAddedOrRemovedSegmentationData: ToolGroupSpecificSegmentationData
  ): void {
    const state = this.getSegmentationState(
      toolGroupUID
    ) as ToolGroupSpecificSegmentationState

    // 1. If there is no segmentationData, return early
    if (state.length === 0) {
      return
    }

    // 2. If there is only one segmentationData, make that one active
    if (state.length === 1) {
      state[0].active = true
      return
    }

    // 3. If removed SegmentationData was active, make the first one active
    const activeSegmentations = state.filter(
      (segmentationData) => segmentationData.active
    )

    if (activeSegmentations.length === 0) {
      state[0].active = true
      return
    }

    // 4. If the added segmentation data is active, make other segmentation data inactive
    if (recentlyAddedOrRemovedSegmentationData.active) {
      state.forEach((segmentationData) => {
        if (
          segmentationData.segmentationDataUID !==
          recentlyAddedOrRemovedSegmentationData.segmentationDataUID
        ) {
          segmentationData.active = false
        }
      })
    }

    // 5. if added/removed segmentation is is inactive, do nothing
  }

  _initDefaultColorLutIfNecessary() {
    // if colorLutTable is not specified or the default one is not found
    if (
      this.state.colorLutTables.length === 0 ||
      !this.state.colorLutTables[0]
    ) {
      this.addColorLUT(CORNERSTONE_COLOR_LUT as ColorLUT, 0)
    }
  }
}

const defaultSegmentationStateManager = new SegmentationStateManager('DEFAULT')
export { defaultSegmentationStateManager }
