import { getRenderingEngine, utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  SegmentationRepresentationConfig,
  RepresentationPublicInput,
  ToolGroupSpecificRepresentation,
  RepresentationPublicInputOptions,
} from '../../types/SegmentationStateTypes';
import * as SegmentationConfig from './config/segmentationConfig';
import {
  addSegmentationRepresentation as addSegmentationRepresentationToState,
  getNextColorLUTIndex,
  addColorLUT,
} from './segmentationState';
import { getRepresentationSpecificConfig } from './helpers/getRepresentationSpecificConfig';
import CORNERSTONE_COLOR_LUT from '../../constants/COLOR_LUT';
import { getToolGroup } from '../../store/ToolGroupManager';
import { triggerAnnotationRenderForViewportIds } from '../../utilities';
import { SegmentationRepresentations } from '../../enums';

async function addSegmentationRepresentation(
  toolGroupId: string,
  representationInput: RepresentationPublicInput,
  toolGroupSpecificConfig?: SegmentationRepresentationConfig
): Promise<string> {
  const { segmentationId, options = {} as RepresentationPublicInputOptions } =
    representationInput;

  const segmentationRepresentationUID =
    representationInput.options?.segmentationRepresentationUID ||
    utilities.uuidv4();

  // Todo: make segmentsHidden also an option that can get passed by
  // the user
  const segmentsHidden = new Set() as Set<number>;

  const colorLUTIndexToUse = getColorLUTIndex(options);

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
    polySeg: options.polySeg,
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

  if (representationInput.type === SegmentationRepresentations.Contour) {
    getToolGroup(toolGroupId)
      .getViewportsInfo()
      .forEach(({ viewportId, renderingEngineId }) => {
        const renderingEngine = getRenderingEngine(renderingEngineId);
        triggerAnnotationRenderForViewportIds(renderingEngine, [viewportId]);
      });
  }

  return segmentationRepresentationUID;
}

function getColorLUTIndex(options = {} as RepresentationPublicInputOptions) {
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
  return colorLUTIndexToUse;
}

export { addSegmentationRepresentation };
