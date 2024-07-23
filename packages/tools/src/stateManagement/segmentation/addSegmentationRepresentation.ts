import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import {
  SegmentationRepresentationConfig,
  RepresentationPublicInput,
  RepresentationPublicInputOptions,
  SegmentationRepresentation,
} from '../../types/SegmentationStateTypes';
import * as SegmentationState from './segmentationState';
import { getSegmentationRepresentationRenderingConfig } from './helpers/getSegmentationRepresentationRenderingConfig';
import CORNERSTONE_COLOR_LUT from '../../constants/COLOR_LUT';
import { triggerAnnotationRenderForViewportIds } from '../../utilities';
import { SegmentationRepresentations } from '../../enums';
import { triggerSegmentationModified } from './triggerSegmentationEvents';

async function addSegmentationRepresentation(
  viewportId: string,
  representationInput: RepresentationPublicInput,
  initialConfig?: SegmentationRepresentationConfig
): Promise<string> {
  const { segmentationId, options = {} as RepresentationPublicInputOptions } =
    representationInput;

  const segmentationRepresentationUID =
    representationInput.options?.segmentationRepresentationUID ||
    utilities.uuidv4();

  const colorLUTIndexToUse = getColorLUTIndex(options);

  const representation: SegmentationRepresentation = {
    segmentationId,
    segmentationRepresentationUID,
    type: representationInput.type,
    colorLUTIndex: colorLUTIndexToUse,
    rendering:
      getSegmentationRepresentationRenderingConfig(representationInput),
    polySeg: options.polySeg,
    config: {
      allSegments: {},
      perSegment: {},
    },
  };

  SegmentationState.addSegmentationRepresentation(viewportId, representation);

  // Update the toolGroup specific configuration
  if (initialConfig) {
    // const globalConfig = SegmentationState.getGlobalConfig();
    // if (
    //   initialConfig.renderInactiveRepresentations !==
    //   globalConfig.renderInactiveRepresentations
    // ) {
    //   SegmentationState.setGlobalConfig({
    //     ...globalConfig,
    //     renderInactiveRepresentations:
    //       initialConfig.renderInactiveRepresentations,
    //   });
    // }

    SegmentationState.setSegmentationRepresentationConfig(
      segmentationRepresentationUID,
      initialConfig.representations
    );
  }

  if (representationInput.type === SegmentationRepresentations.Contour) {
    triggerAnnotationRenderForViewportIds([viewportId]);
  }

  triggerSegmentationModified(segmentationId);

  return segmentationRepresentationUID;
}

function getColorLUTIndex(options = {} as RepresentationPublicInputOptions) {
  const colorLUTOrIndexInput = options.colorLUTOrIndex;
  let colorLUTIndexToUse;

  if (typeof colorLUTOrIndexInput === 'number') {
    colorLUTIndexToUse = colorLUTOrIndexInput;
  } else {
    const nextIndex = SegmentationState.getNextColorLUTIndex();
    const colorLUTToAdd = Array.isArray(colorLUTOrIndexInput)
      ? colorLUTOrIndexInput
      : CORNERSTONE_COLOR_LUT;
    SegmentationState.addColorLUT(colorLUTToAdd as Types.ColorLUT, nextIndex);
    colorLUTIndexToUse = nextIndex;
  }
  return colorLUTIndexToUse;
}

export { addSegmentationRepresentation };
