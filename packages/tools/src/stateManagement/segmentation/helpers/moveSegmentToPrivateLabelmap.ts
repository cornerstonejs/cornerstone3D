import { utilities } from '@cornerstonejs/core';
import { getSegmentation } from '../getSegmentation';
import { triggerSegmentationDataModified } from '../triggerSegmentationEvents';
import { moveSegmentToPrivateLabelmap as moveSegmentToPrivateLayer } from '../labelmapModel/privateLabelmap';

const { DefaultHistoryMemo } = utilities.HistoryMemo;

/**
 * Moves a segment to a new labelmap layer that holds only that segment. After
 * the move, the segment can overlap the other segments of the segmentation.
 * The brush never moves a segment by itself: an application calls this
 * function when the user asks for an overlapping segment.
 *
 * @param segmentationId - The unique identifier of the segmentation.
 * @param segmentIndex - The index of the segment to move.
 * @param options - Optional. recordHistory: when true, record the move in
 * history, so that undo puts the segment back on its previous layer.
 * @returns The id of the layer that holds the segment, or undefined when the
 * segment has no layer. When the segment is already alone on its layer, the
 * segment stays on that layer.
 */
export function moveSegmentToPrivateLabelmap(
  segmentationId: string,
  segmentIndex: number,
  options?: { recordHistory?: boolean }
): string | undefined {
  const segmentation = getSegmentation(segmentationId);
  if (!segmentation?.representationData.Labelmap) {
    return;
  }

  const layer = moveSegmentToPrivateLayer(segmentation, segmentIndex, {
    moveStepCallback: (step) => {
      if (!options?.recordHistory) {
        return;
      }

      DefaultHistoryMemo.push({
        restoreMemo: (undo) => {
          if (undo) {
            step.undo();
          } else {
            step.redo();
          }
          triggerSegmentationDataModified(segmentationId);
        },
      });
    },
  });

  triggerSegmentationDataModified(segmentationId);

  return layer?.labelmapId;
}
