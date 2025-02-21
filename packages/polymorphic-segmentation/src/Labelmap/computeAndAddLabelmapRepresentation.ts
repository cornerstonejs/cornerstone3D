import * as cornerstoneTools from '@cornerstonejs/tools';
import { computeAndAddRepresentation } from '../computeAndAddRepresentation';
import { computeLabelmapData } from './labelmapComputationStrategies';
import type { PolySegConversionOptions } from '../types';

const { SegmentationRepresentations } = cornerstoneTools.Enums;
const { defaultSegmentationStateManager, triggerSegmentationEvents } = cornerstoneTools.segmentation;
const { triggerSegmentationDataModified } = triggerSegmentationEvents;

/**
 * Computes and adds the labelmap representation for a given segmentation.
 *
 * @param segmentationId - The id of the segmentation
 * @param options - Optional parameters for computing the labelmap representation
 * @returns A promise that resolves when the labelmap representation is computed and added
 */
export async function computeAndAddLabelmapRepresentation(
  segmentationId: string,
  options: PolySegConversionOptions = {}
) {
  return computeAndAddRepresentation(
    segmentationId,
    SegmentationRepresentations.Labelmap,
    () => computeLabelmapData(segmentationId, options),
    () => null,
    () => {
      defaultSegmentationStateManager.processLabelmapRepresentationAddition(
        options.viewport.id,
        segmentationId
      );

      /// need to figure out how to trigger the labelmap update properly
      setTimeout(() => {
        triggerSegmentationDataModified(segmentationId);
      }, 0);
    }
  );
}
