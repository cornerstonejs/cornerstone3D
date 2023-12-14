import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  SegmentationRepresentationConfig,
  RepresentationPublicInput,
  ToolGroupSpecificRepresentation,
} from '../../types/SegmentationStateTypes';
import * as SegmentationConfig from './config/segmentationConfig';
import {
  addSegmentationRepresentation as addSegmentationRepresentationToState,
  getNextColorLUTIndex,
  addColorLUT,
} from './segmentationState';
import { getRepresentationSpecificConfig } from './helpers/getRepresentationSpecificConfig';
import CORNERSTONE_COLOR_LUT from '../../constants/COLOR_LUT';

async function addSegmentationRepresentation(
  toolGroupId: string,
  representationInput: RepresentationPublicInput,
  toolGroupSpecificConfig?: SegmentationRepresentationConfig
): Promise<string> {
  const { segmentationId, options = {} } = representationInput;
  const segmentationRepresentationUID = utilities.uuidv4();

  // Todo: make segmentsHidden also an option that can get passed by
  // the user
  const segmentsHidden = new Set() as Set<number>;

  const colorLUTOrIndexInput = options.colorLUTOrIndex;
  let colorLUTIndexToUse;

  if (typeof colorLUTOrIndexInput === 'number') {
    colorLUTIndexToUse = colorLUTOrIndexInput;
  } else {
    const nextIndex = getNextColorLUTIndex();
    const colorLUTToAdd = Array.isArray(colorLUTOrIndexInput)
      ? colorLUTOrIndexInput
      : CORNERSTONE_COLOR_LUT;
    addColorLUT(colorLUTToAdd as Types.ColorLUT, nextIndex);
    colorLUTIndexToUse = nextIndex;
  }

  const toolGroupSpecificRepresentation: ToolGroupSpecificRepresentation = {
    segmentationId,
    segmentationRepresentationUID,
    type: representationInput.type,
    segmentsHidden,
    colorLUTIndex: colorLUTIndexToUse,
    active: true,
    segmentationRepresentationSpecificConfig: {},
    segmentSpecificConfig: {},
    config: getRepresentationSpecificConfig(representationInput),
  };

  // Update the toolGroup specific configuration
  if (toolGroupSpecificConfig) {
    // Since setting configuration on toolGroup will trigger a segmentationRepresentation
    // update event, we don't want to trigger the event twice, so we suppress
    // the first one
    const currentToolGroupConfig =
      SegmentationConfig.getToolGroupSpecificConfig(toolGroupId);

    const mergedConfig = utilities.deepMerge(
      currentToolGroupConfig,
      toolGroupSpecificConfig
    );

    SegmentationConfig.setToolGroupSpecificConfig(toolGroupId, {
      renderInactiveSegmentations:
        mergedConfig.renderInactiveSegmentations || true,
      representations: {
        ...mergedConfig.representations,
      },
    });
  }

  addSegmentationRepresentationToState(
    toolGroupId,
    toolGroupSpecificRepresentation
  );

  return segmentationRepresentationUID;
}

export { addSegmentationRepresentation };
