import { BaseTool } from '../base'
import { getEnabledElementByIds } from '@cornerstonejs/core'
import Representations from '../../enums/SegmentationRepresentations'
import { getSegmentationState } from '../../stateManagement/segmentation/segmentationState'
import { LabelmapDisplay } from './Labelmap'
import { segmentationConfig } from '../../stateManagement/segmentation'
import { triggerSegmentationStateModified } from '../../stateManagement/segmentation/triggerSegmentationEvents'
import { getToolGroupByToolGroupId } from '../../store/ToolGroupManager'
import {
  ToolGroupSpecificSegmentationData,
  SegmentationConfig,
} from '../../types/SegmentationStateTypes'

import { PublicToolProps, ToolProps } from '../../types'

import { deepMerge } from '../../utilities'

/**
 * In Cornerstone3DTools, displaying of segmentations are handled by the SegmentationDisplayTool.
 * Generally, any Segmentation can be viewed in various representations such as
 * labelmap (3d), contours, surface etc. As of now, Cornerstone3DTools only implements
 * Labelmap representation (default).
 *
 * SegmentationDisplayTool works at ToolGroup level, and is responsible for displaying the
 * segmentation for ALL viewports of a toolGroup, this way we can support complex
 * scenarios for displaying segmentations.
 *
 * Current Limitations:
 * - Only supports rendering of the volumetric segmentations in 3D space. (StackViewport segmentations are not supported yet)
 * - Labelmap representation is the only supported representation for now.
 *
 * Similar to other tools in Cornerstone3DTools, the SegmentationDisplayTool should
 * be added to the CornerstoneTools by calling cornerstoneTools.addTool(SegmentationDisplayTool)
 * and a toolGroup should be created for it using the ToolGroupManager API, finally
 * viewports information such as viewportId and renderingEngineId should be provided
 * to the toolGroup and the SegmentationDisplayTool should be set to be activated.
 * For adding segmentations to be displayed you can addSegmentationsForToolGroup helper.
 *
 * ```js
 *
 *  addSegmentationsForToolGroup('toolGroupId', [
 *     {
 *       volumeId: segmentationUID,
 *     },
 *  ])
 *
 * ```
 */
export default class SegmentationDisplayTool extends BaseTool {
  static toolName = 'SegmentationDisplay'
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      configuration: {},
    }
  ) {
    super(toolProps, defaultToolProps)
  }

  enableCallback(): void {
    const toolGroupId = this.toolGroupId
    const toolGroupSegmentationState = getSegmentationState(toolGroupId)

    if (toolGroupSegmentationState.length === 0) {
      return
    }

    // for each segmentationData, make the visibility false
    for (const segmentationData of toolGroupSegmentationState) {
      segmentationData.visibility = true
    }

    // trigger the update
    triggerSegmentationStateModified(toolGroupId)
  }

  disableCallback(): void {
    const toolGroupId = this.toolGroupId
    const toolGroupSegmentationState = getSegmentationState(toolGroupId)

    if (toolGroupSegmentationState.length === 0) {
      return
    }

    // for each segmentationData, make the visibility false
    for (const segmentationData of toolGroupSegmentationState) {
      segmentationData.visibility = false
    }

    // trigger the update
    triggerSegmentationStateModified(toolGroupId)
  }

  /**
   * It is used to trigger the render for each segmentations in the toolGroup.
   * Based on the segmentation representation type, it will call the corresponding
   * render function.
   *
   * @param toolGroupId - the toolGroupId
   */
  renderSegmentation = (toolGroupId: string): void => {
    const toolGroup = getToolGroupByToolGroupId(toolGroupId)

    if (!toolGroup) {
      return
    }

    const toolGroupSegmentationState = getSegmentationState(toolGroupId)

    // toolGroup Viewports
    const toolGroupViewports = toolGroup.viewportsInfo.map(
      ({ renderingEngineId, viewportId }) => {
        const enabledElement = getEnabledElementByIds(
          viewportId,
          renderingEngineId
        )

        if (enabledElement) {
          return enabledElement.viewport
        }
      }
    )

    // Render each segmentationData, in each viewport in the toolGroup
    toolGroupSegmentationState.forEach(
      (segmentationData: ToolGroupSpecificSegmentationData) => {
        const config = this._getSegmentationConfig(toolGroupId)
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

  _getSegmentationConfig(toolGroupId: string): SegmentationConfig {
    const toolGroupConfig =
      segmentationConfig.getSegmentationConfig(toolGroupId)

    const globalConfig = segmentationConfig.getGlobalSegmentationConfig()

    // merge two configurations and override the global config
    const mergedConfig = deepMerge(globalConfig, toolGroupConfig)

    return mergedConfig
  }
}
