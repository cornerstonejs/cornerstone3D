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
import { getSegmentationRepresentation } from './getSegmentationRepresentation';
import { defaultSegmentationStateManager } from './SegmentationStateManager';

function getLabelmapSegmentationRepresentationRenderingConfig() {
  const cfun = vtkColorTransferFunction.newInstance();
  const ofun = vtkPiecewiseFunction.newInstance();
  ofun.addPoint(0, 0);
  return {
    ofun,
    cfun,
  };
}

async function internalAddSegmentationRepresentation(
  viewportId: string,
  representationInput: RepresentationPublicInput
): Promise<string> {
  const { segmentationId, options = {} as RepresentationPublicInputOptions } =
    representationInput;

  const segmentationRepresentationUID =
    representationInput.options?.segmentationRepresentationUID ||
    utilities.uuidv4();

  // if the segmentationRepresentationUID is already in the state, we should use it
  // and add it to the viewport instead

  const existingRepresentation = getSegmentationRepresentation(
    segmentationRepresentationUID
  );

  if (existingRepresentation) {
    internalAddSegmentationRepresentationUIDToViewport(
      viewportId,
      existingRepresentation.segmentationRepresentationUID
    );
  } else {
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

/**
 * Adds a segmentation representation UID to a specific viewport.
 *
 * This function uses the default segmentation state manager to associate
 * a segmentation representation with a given viewport. This is typically
 * used to prepare a viewport for rendering a specific segmentation.
 *
 * @param viewportId - The unique identifier of the viewport to which the
 *                     segmentation representation should be added.
 * @param segmentationRepresentationUID - The unique identifier of the
 *                                        segmentation representation to be
 *                                        added to the viewport.
 *
 * @returns void
 *
 * @example
 * ```typescript
 * addSegmentationRepresentationUIDToViewport('viewport1', 'segmentationUID123');
 * ```
 */
export function internalAddSegmentationRepresentationUIDToViewport(
  viewportId: string,
  segmentationRepresentationUID: string
): void {
  const segmentationStateManager = defaultSegmentationStateManager;

  const segmentationRepresentation =
    segmentationStateManager.getSegmentationRepresentation(
      segmentationRepresentationUID
    );

  if (!segmentationRepresentation) {
    throw new Error(
      `Segmentation representation with UID ${segmentationRepresentationUID} not found`
    );
  }

  segmentationStateManager.addSegmentationRepresentationToViewport(
    viewportId,
    segmentationRepresentationUID
  );
}

export { internalAddSegmentationRepresentation };
