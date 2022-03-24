import { utilities as csUtils } from '@cornerstonejs/core'

import _cloneDeep from 'lodash.clonedeep'
import {
  SegmentationDataInput,
  SegmentationConfig,
} from '../../types/SegmentationStateTypes'
import { checkSegmentationDataIsValid } from './helpers'
import Representations from '../../enums/SegmentationRepresentations'
import { getToolGroupByToolGroupUID } from '../../store/ToolGroupManager'

import { LabelmapDisplay } from '../../tools/displayTools/Labelmap'

/**
 * Add a segmentation to the viewports of the toolGroup. It will use the
 * provided segmentationDataArray to create and configure the segmentation based
 * on the representation type and representation specific configuration.
 * @param toolGroupId - The Id of the toolGroup to add the segmentation to.
 * @param segmentationDataArray - minimum of volumeId should be provided, it will
 * throw an error if not. If no representation type is provided, it will use
 * the default labelmap representation.
 * @param toolGroupSpecificConfig - The toolGroup specific configuration
 * for the segmentation display.
 */
async function addSegmentationsForToolGroup(
  toolGroupId: string,
  segmentationDataArray: SegmentationDataInput[],
  toolGroupSpecificConfig?: SegmentationConfig
): Promise<void> {
  checkSegmentationDataIsValid(segmentationDataArray)

  // Check if there exists a toolGroup with the toolGroupId
  const toolGroup = getToolGroupByToolGroupUID(toolGroupId)

  if (!toolGroup) {
    throw new Error(`No tool group found for toolGroupId: ${toolGroupId}`)
  }

  const promises = segmentationDataArray.map(async (segData) => {
    const segmentationData = _cloneDeep(segData)

    segmentationData.segmentationDataUID = csUtils.uuidv4()
    return _addSegmentation(
      toolGroupId,
      segmentationData,
      toolGroupSpecificConfig
    )
  })

  await Promise.all(promises)
}

async function _addSegmentation(
  toolGroupId,
  segmentationData,
  toolGroupSpecificConfig
) {
  const representationType = segmentationData.representation?.type
    ? segmentationData.representation.type
    : Representations.Labelmap

  // create representation config if not provided by
  if (!segmentationData.representation) {
    segmentationData.representation = {
      type: representationType,
    }
  }

  // Create empty config if not provided by.
  // Note: this is representation-required configuration for the segmentation
  // For Labelmap, it is the cfun and ofun. Todo: maybe we change this to props?
  if (!segmentationData.representation.config) {
    segmentationData.representation.config = {}
  }

  if (representationType === Representations.Labelmap) {
    await LabelmapDisplay.addSegmentationData(
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
