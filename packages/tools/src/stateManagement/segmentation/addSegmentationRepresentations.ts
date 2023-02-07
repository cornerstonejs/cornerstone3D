import _cloneDeep from 'lodash.clonedeep';
import {
  SegmentationRepresentationConfig,
  RepresentationPublicInput,
} from '../../types/SegmentationStateTypes';
import Representations from '../../enums/SegmentationRepresentations';
import { getToolGroup } from '../../store/ToolGroupManager';

import { labelmapDisplay } from '../../tools/displayTools/Labelmap';
import { contourDisplay } from '../../tools/displayTools/Contour';

/**
 * Set the specified segmentation representations on the viewports of the specified
 * toolGroup. It accepts a second argument which is a toolGroup specific representation
 * configuration.
 *
 * @param toolGroupId - The Id of the toolGroup to add the segmentation representations to
 * @param representationInputArray - An array of segmentation representations to add to the toolGroup
 * @param toolGroupSpecificRepresentationConfig - The toolGroup specific configuration
 * for the segmentation representations
 */
async function addSegmentationRepresentations(
  toolGroupId: string,
  representationInputArray: RepresentationPublicInput[],
  toolGroupSpecificRepresentationConfig?: SegmentationRepresentationConfig
): Promise<string[]> {
  // Check if there exists a toolGroup with the toolGroupId
  const toolGroup = getToolGroup(toolGroupId);

  if (!toolGroup) {
    throw new Error(`No tool group found for toolGroupId: ${toolGroupId}`);
  }

  const promises = representationInputArray.map((representationInput) => {
    return _addSegmentationRepresentation(
      toolGroupId,
      representationInput,
      toolGroupSpecificRepresentationConfig
    );
  });

  const segmentationRepresentationUIDs = await Promise.all(promises);

  return segmentationRepresentationUIDs;
}

async function _addSegmentationRepresentation(
  toolGroupId: string,
  representationInput: RepresentationPublicInput,
  toolGroupSpecificRepresentationConfig?: SegmentationRepresentationConfig
): Promise<string> {
  let segmentationRepresentationUID;

  if (representationInput.type === Representations.Labelmap) {
    segmentationRepresentationUID =
      await labelmapDisplay.addSegmentationRepresentation(
        toolGroupId,
        representationInput,
        toolGroupSpecificRepresentationConfig
      );
  } else if (representationInput.type === Representations.Contour) {
    segmentationRepresentationUID =
      await contourDisplay.addSegmentationRepresentation(
        toolGroupId,
        representationInput,
        toolGroupSpecificRepresentationConfig
      );
  } else {
    throw new Error(
      `The representation type ${representationInput.type} is not supported`
    );
  }

  return segmentationRepresentationUID;
}

export default addSegmentationRepresentations;
