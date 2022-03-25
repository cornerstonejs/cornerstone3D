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
   * It returns an array of toolGroupIds currently in the segmentation state.
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
   * Given a segmentation Id, return the global segmentation data for that
   * segmentation
   * @param segmentationId - The id of the segmentation to get the
   * global data for.
   * @returns - The global segmentation data for the
   * segmentation with the given Id.
   */
  getSegmentation(segmentationId: string): GlobalSegmentationData | undefined {
    return this.state.global.segmentations?.find(
      (segmentationState) => segmentationState.volumeId === segmentationId
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
   * Given a segmentation Id, return a list of tool group IDs that have that
   * segmentation in their segmentation state (segmentation has been added
   * to the tool group).
   * @param segmentationId - The id of the segmentation volume.
   * @returns An array of toolGroupIds.
   */
  getToolGroupsWithSegmentation(segmentationId: string): string[] {
    const toolGroupIds = Object.keys(this.state.toolGroups)

    const foundToolGroupIds = []
    toolGroupIds.forEach((toolGroupId) => {
      const toolGroupSegmentationState = this.getSegmentationState(
        toolGroupId
      ) as ToolGroupSpecificSegmentationState

      const segmentationData = toolGroupSegmentationState.find(
        (segmentationData) => segmentationData.volumeId === segmentationId
      )

      if (segmentationData) {
        foundToolGroupIds.push(toolGroupId)
      }
    })

    return foundToolGroupIds
  }

  /**
   * Get the segmentation state for the toolGroup containing array of
   * segmentation data objects.
   *
   * @param toolGroupId - The Id of the tool group that the segmentation
   * belongs to.
   * @returns An array of objects, each of which contains the data for a single
   * segmentation data
   */
  getSegmentationState(
    toolGroupId: string
  ): ToolGroupSpecificSegmentationState | [] {
    const toolGroupSegmentationState = this.state.toolGroups[toolGroupId]

    if (!toolGroupSegmentationState) {
      return []
    }

    return this.state.toolGroups[toolGroupId].segmentations
  }

  /**
   * Given a tool group UID and a representation type, return toolGroup specific
   * config for that representation type.
   *
   * @param toolGroupId - The Id of the tool group
   * @param representationType - The type of representation, currently only Labelmap
   * @returns A SegmentationConfig object.
   */
  getSegmentationConfig(toolGroupId: string): SegmentationConfig | undefined {
    const toolGroupStateWithConfig = this.state.toolGroups[toolGroupId]

    if (!toolGroupStateWithConfig) {
      return
    }

    return toolGroupStateWithConfig.config
  }

  /**
   * Set the segmentation config for a given tool group. It will create a new
   * tool group specific config if one does not exist.
   *
   * @param toolGroupId - The Id of the tool group that the segmentation
   * belongs to.
   * @param config - SegmentationConfig
   */
  setSegmentationConfig(toolGroupId: string, config: SegmentationConfig): void {
    let toolGroupStateWithConfig = this.state.toolGroups[toolGroupId]

    if (!toolGroupStateWithConfig) {
      this.state.toolGroups[toolGroupId] = {
        segmentations: [],
        config: {
          renderInactiveSegmentations: true,
          representations: {},
        },
      }

      toolGroupStateWithConfig = this.state.toolGroups[toolGroupId]
    }

    toolGroupStateWithConfig.config = {
      ...toolGroupStateWithConfig.config,
      ...config,
    }
  }

  /**
   * Given a toolGroupId and a segmentationDataUID, return the segmentation data for that tool group.
   * @param toolGroupId - The Id of the tool group that the segmentation
   * data belongs to.
   * @param segmentationDataUID - string
   * @returns A ToolGroupSpecificSegmentationData object.
   */
  getSegmentationDataByUID(
    toolGroupId: string,
    segmentationDataUID: string
  ): ToolGroupSpecificSegmentationData | undefined {
    const toolGroupSegState = this.getSegmentationState(
      toolGroupId
    ) as ToolGroupSpecificSegmentationState

    const segmentationData = toolGroupSegState.find(
      (segData) => segData.segmentationDataUID === segmentationDataUID
    )

    return segmentationData
  }

  /**
   * Get the active segmentation data for a tool group
   * @param toolGroupId - The Id of the tool group that the segmentation
   * data belongs to.
   * @returns A ToolGroupSpecificSegmentationData object.
   */
  getActiveSegmentationData(
    toolGroupId: string
  ): ToolGroupSpecificSegmentationData | undefined {
    const toolGroupSegState = this.getSegmentationState(
      toolGroupId
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
    const { volumeId } = segmentationData

    // Creating the default color LUT if not created yet
    this._initDefaultColorLutIfNecessary()

    // Don't allow overwriting existing labelmapState with the same labelmapUID
    const existingGlobalSegmentationData = this.getSegmentation(volumeId)

    // merge the new state with the existing state
    const updatedState = {
      ...existingGlobalSegmentationData,
      ...segmentationData,
    }

    // Is there any existing state?
    if (!existingGlobalSegmentationData) {
      this.state.global.segmentations.push({
        volumeId,
        label: segmentationData.label,
        referenceVolumeId: segmentationData.referenceVolumeId,
        cachedStats: segmentationData.cachedStats,
        referenceImageId: segmentationData.referenceImageId,
        activeSegmentIndex: segmentationData.activeSegmentIndex,
        segmentsLocked: segmentationData.segmentsLocked,
      })

      return
    }

    // If there is an existing state, replace it
    const index = this.state.global.segmentations.findIndex(
      (segmentationState) => segmentationState.volumeId === volumeId
    )
    this.state.global.segmentations[index] = updatedState
  }

  /**
   * Add a new segmentation data to the toolGroup's segmentation state
   * @param toolGroupId - The Id of the tool group that the segmentation
   * belongs to.
   * @param segmentationData - ToolGroupSpecificSegmentationData
   */
  addSegmentationData(
    toolGroupId: string,
    segmentationData: ToolGroupSpecificSegmentationData
  ): void {
    // Initialize the default toolGroup state if not created yet
    if (!this.state.toolGroups[toolGroupId]) {
      this.state.toolGroups[toolGroupId] = {
        segmentations: [],
        config: {} as SegmentationConfig,
      }
    }

    // local toolGroupSpecificSegmentationState
    this.state.toolGroups[toolGroupId].segmentations.push(segmentationData)
    this._handleActiveSegmentation(toolGroupId, segmentationData)
  }

  /**
   * Set the active segmentation data for a tool group
   * @param toolGroupId - The Id of the tool group that owns the
   * segmentation data.
   * @param segmentationDataUID - string
   */
  setActiveSegmentationData(
    toolGroupId: string,
    segmentationDataUID: string
  ): void {
    const toolGroupSegmentations = this.getSegmentationState(toolGroupId)

    if (!toolGroupSegmentations || !toolGroupSegmentations.length) {
      throw new Error(
        `No segmentation data found for toolGroupId: ${toolGroupId}`
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
    this._handleActiveSegmentation(toolGroupId, segmentationData)
  }

  /**
   * Remove a segmentation data from the toolGroup specific segmentation state
   * @param toolGroupId - The Id of the tool group that the segmentation
   * data is associated with.
   * @param segmentationDataUID - string
   */
  removeSegmentationData(
    toolGroupId: string,
    segmentationDataUID: string
  ): void {
    const toolGroupSegmentations = this.getSegmentationState(toolGroupId)

    if (!toolGroupSegmentations || !toolGroupSegmentations.length) {
      throw new Error(
        `No viewport specific segmentation state found for viewport ${toolGroupId}`
      )
    }

    const state = toolGroupSegmentations as ToolGroupSpecificSegmentationState
    const index = state.findIndex(
      (segData) => segData.segmentationDataUID === segmentationDataUID
    )

    if (index === -1) {
      console.warn(
        `No viewport specific segmentation state data found for viewport ${toolGroupId} and segmentation data UID ${segmentationDataUID}`
      )
    }

    const removedSegmentationData = toolGroupSegmentations[index]
    toolGroupSegmentations.splice(index, 1)
    this._handleActiveSegmentation(toolGroupId, removedSegmentationData)
  }

  /**
   * It handles the active segmentation data based on the active status of the
   * segmentation data that was added or removed.
   *
   * @param toolGroupId - The Id of the tool group that the segmentation
   * data belongs to.
   * @param recentlyAddedOrRemovedSegmentationData - ToolGroupSpecificSegmentationData
   */
  _handleActiveSegmentation(
    toolGroupId: string,
    recentlyAddedOrRemovedSegmentationData: ToolGroupSpecificSegmentationData
  ): void {
    const state = this.getSegmentationState(
      toolGroupId
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
