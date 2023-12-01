import { utilities } from '@cornerstonejs/core';
import {
  SegmentationRepresentationConfig,
  RepresentationPublicInput,
  ToolGroupSpecificRepresentation,
} from '../../types/SegmentationStateTypes';
import Representations from '../../enums/SegmentationRepresentations';
import * as SegmentationConfig from './config/segmentationConfig';
import { addSegmentationRepresentation as addSegmentationRepresentationToState } from './segmentationState';
import { getRepresentationSpecificConfig } from './helpers/getRepresentationSpecificConfig';

async function addSegmentationRepresentation(
  toolGroupId: string,
  representationInput: RepresentationPublicInput,
  toolGroupSpecificConfig?: SegmentationRepresentationConfig
): Promise<string> {
  const { segmentationId } = representationInput;
  const segmentationRepresentationUID = utilities.uuidv4();

  // Todo: make these configurable during representation input by user
  const segmentsHidden = new Set() as Set<number>;
  const colorLUTIndex = 0;
  const active = true;

  const config = getRepresentationSpecificConfig(representationInput);

  const toolGroupSpecificRepresentation: ToolGroupSpecificRepresentation = {
    segmentationId,
    segmentationRepresentationUID,
    type: Representations.Labelmap,
    segmentsHidden,
    colorLUTIndex,
    active,
    segmentationRepresentationSpecificConfig: {},
    segmentSpecificConfig: {},
    config,
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
