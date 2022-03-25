import { utilities as csUtils } from '@cornerstonejs/core'

import _cloneDeep from 'lodash.clonedeep'
import {
  SegmentationRepresentationConfig,
  SegmentationPublicInput,
} from '../../types/SegmentationStateTypes'
import { validateSegmentationInputArray } from './helpers'
import Representations from '../../enums/SegmentationRepresentations'
import { getToolGroupById } from '../../store/ToolGroupManager'

import { LabelmapDisplay } from '../../tools/displayTools/Labelmap'

/**
 * Add a segmentation to the viewports of the toolGroup. It will use the
 * provided segmentationDataArray to create and configure the segmentation based
 * on the representation type and representation specific configuration.
 * @param toolGroupId - The Id of the toolGroup to add the segmentation to.
 * @param segmentationInput - The type of the segmentation representation to be shown
 * and its required properties for rendering
 * @param toolGroupSpecificConfig - The toolGroup specific configuration
 * for the segmentation display.
 */
async function addSegmentationsForToolGroup(
  toolGroupId: string,
  segmentationInputArray: SegmentationPublicInput[],
  toolGroupSpecificConfig?: SegmentationRepresentationConfig
): Promise<void> {
  validateSegmentationInputArray(segmentationInputArray)

  // Check if there exists a toolGroup with the toolGroupId
  const toolGroup = getToolGroupById(toolGroupId)

  if (!toolGroup) {
    throw new Error(`No tool group found for toolGroupId: ${toolGroupId}`)
  }

  const promises = segmentationInputArray.map(async (segInput) => {
    const segmentationInput = _cloneDeep(segInput)

    // segmentationData.segmentationDataUID = csUtils.uuidv4()
    return _addSegmentation(
      toolGroupId,
      segmentationInput,
      toolGroupSpecificConfig
    )
  })

  await Promise.all(promises)
}

async function _addSegmentation(
  toolGroupId: string,
  segmentationInput: SegmentationPublicInput,
  toolGroupSpecificConfig: SegmentationRepresentationConfig
) {
  const representationType = segmentationInput.type
    ? segmentationInput.type
    : Representations.Labelmap

  // Create empty config if not provided by.
  // Note: this is representation-required configuration for the segmentation
  // For Labelmap, it is the cfun and ofun. Todo: maybe we change this to props?
  if (!segmentationInput.representation.config) {
    segmentationInput.representation.config = {}
  }

  if (representationType === Representations.Labelmap) {
    await LabelmapDisplay.addSegmentationInput(
      toolGroupId,
      segmentationData,
      toolGroupSpecificConfig
    )
  } else {
    throw new Error(
      `The representation type ${representationType} is not supported yet`
    )
  }
}

export default addSegmentationsForToolGroup
