import { BaseTool } from '../base'
import {
  getEnabledElementByUIDs,
  Types,
} from '@precisionmetrics/cornerstone-render'
import Representations from '../../enums/SegmentationRepresentations'
import { getSegmentationState } from '../../stateManagement/segmentation/segmentationState'
import { LabelmapDisplay } from './Labelmap'
import {
  triggerSegmentationStateModified,
  segmentationConfigController,
} from '../../store/SegmentationModule'
import {
  getToolGroup,
  getToolGroupByToolGroupUID,
} from '../../store/ToolGroupManager'
import {
  ToolGroupSpecificSegmentationData,
  SegmentationConfig,
} from '../../types/SegmentationStateTypes'

import { deepMerge } from '../../util'

export default class SegmentationDisplayTool extends BaseTool {
  constructor(toolConfiguration = {}) {
    super(toolConfiguration, {
      name: 'SegmentationDisplay',
      configuration: {},
    })
  }

  // Todo: this is too weird that we are passing toolGroupUID to the enableCallback
  enableCallback(): void {
    const toolGroupUID = this.toolGroupUID
    const toolGroupSegmentationState = getSegmentationState(toolGroupUID)

    if (toolGroupSegmentationState.length === 0) {
      return
    }

    // for each segmentationData, make the visibility false
    for (const segmentationData of toolGroupSegmentationState) {
      segmentationData.visibility = true
    }

    // trigger the update
    triggerSegmentationStateModified(toolGroupUID)
  }

  disableCallback(): void {
    const toolGroupUID = this.toolGroupUID
    const toolGroupSegmentationState = getSegmentationState(toolGroupUID)

    if (toolGroupSegmentationState.length === 0) {
      return
    }

    // for each segmentationData, make the visibility false
    for (const segmentationData of toolGroupSegmentationState) {
      segmentationData.visibility = false
    }

    // trigger the update
    triggerSegmentationStateModified(toolGroupUID)
  }

  renderToolData(toolGroupUID: string): void {
    const toolGroup = getToolGroupByToolGroupUID(toolGroupUID)

    if (!toolGroup) {
      return
    }

    const toolGroupSegmentationState = getSegmentationState(toolGroupUID)

    // toolGroup Viewports
    const toolGroupViewports = toolGroup.viewportsInfo.map(
      ({ renderingEngineUID, viewportUID }) => {
        const enabledElement = getEnabledElementByUIDs(
          renderingEngineUID,
          viewportUID
        )

        if (enabledElement) {
          return enabledElement.viewport
        }
      }
    )

    // Render each segmentationData, in each viewport in the toolGroup
    toolGroupSegmentationState.forEach(
      (segmentationData: ToolGroupSpecificSegmentationData) => {
        const config = this._getSegmentationConfig(toolGroupUID)
        const { representation } = segmentationData

        toolGroupViewports.forEach((viewport) => {
          if (representation.type == Representations.Labelmap) {
            LabelmapDisplay.render(viewport, segmentationData, config)
          } else {
            throw new Error(
              `Render for ${representation.type} is not supported yet`
            )
          }
        })
      }
    )

    // for all viewports in the toolGroup trigger a re-render
    toolGroupViewports.forEach((viewport) => {
      viewport.render()
    })
  }

  _getSegmentationConfig(toolGroupUID: string): SegmentationConfig {
    const toolGroupConfig =
      segmentationConfigController.getSegmentationConfig(toolGroupUID)

    const globalConfig =
      segmentationConfigController.getGlobalSegmentationConfig()

    // merge two configurations and override the global config
    const mergedConfig = deepMerge(globalConfig, toolGroupConfig)

    return mergedConfig
  }
}
