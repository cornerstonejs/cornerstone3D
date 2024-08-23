import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';

import { utilities } from '@cornerstonejs/core';
import type { Types } from '@cornerstonejs/core';
import type {
  RepresentationPublicInput,
  RepresentationPublicInputOptions,
  SegmentationRepresentation,
} from '../../types/SegmentationStateTypes';
import CORNERSTONE_COLOR_LUT from '../../constants/COLOR_LUT';
import { triggerAnnotationRenderForViewportIds } from '../../utilities/triggerAnnotationRenderForViewportIds';
import { SegmentationRepresentations } from '../../enums';
import { triggerSegmentationModified } from './triggerSegmentationEvents';
import { addColorLUT } from './addColorLUT';
import { getNextColorLUTIndex } from './getNextColorLUTIndex';
import { setSegmentationRepresentationConfig } from './setSegmentationRepresentationConfig';
import { addSegmentationRepresentationState } from './addSegmentationRepresentationState';
function getLabelmapSegmentationRepresentationRenderingConfig() {
  const cfun = vtkColorTransferFunction.newInstance();
  const ofun = vtkPiecewiseFunction.newInstance();
  ofun.addPoint(0, 0);
  return {
    ofun,
    cfun,
  };
}

async function addSegmentationRepresentation(
  viewportId: string,
  representationInput: RepresentationPublicInput
): Promise<string> {
  const { segmentationId, options = {} as RepresentationPublicInputOptions } =
    representationInput;

  const segmentationRepresentationUID =
    representationInput.options?.segmentationRepresentationUID ||
    utilities.uuidv4();

  const colorLUTIndexToUse = getColorLUTIndex(options);

  const { type } = representationInput;

  let renderingConfig;
  if (type === SegmentationRepresentations.Labelmap) {
    renderingConfig = getLabelmapSegmentationRepresentationRenderingConfig();
  } else {
    renderingConfig = {};
  }

  const representation: SegmentationRepresentation = {
    segmentationId,
    segmentationRepresentationUID,
    type: representationInput.type,
    colorLUTIndex: colorLUTIndexToUse,
    rendering: renderingConfig,
    polySeg: options.polySeg,
    config: {
      allSegments: {},
      perSegment: {},
    },
  };

  addSegmentationRepresentationState(viewportId, representation);
  const initialConfig = representationInput.config;
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

    setSegmentationRepresentationConfig(
      segmentationRepresentationUID,
      initialConfig
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
