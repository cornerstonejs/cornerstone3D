import { generateContourSetsFromLabelmap } from '../contours';
import SegmentationRepresentations from '../../enums/SegmentationRepresentations';
import findLargestBidirectional from './findLargestBidirectional';

const { Labelmap } = SegmentationRepresentations;

/**
 * Generates a contour object over the segment, and then uses the contouring to
 * find the largest bidirectional object that can be applied within the acquisition
 * plane that is within the segment index, or the contained segment indices.
 *
 * @param segmentation.segments - a list of segments to apply the contour to.
 * @param segmentation.segments.containedSegmentIndices - a set of segment indexes equivalent to the primary segment
 * @param segmentation.segments.label - the label for the segment
 * @param segmentation.segments.color - the color to use for the segment label
 */
export default function contourAndFindLargestBidirectional(segmentation) {
  const contours = generateContourSetsFromLabelmap({
    segmentations: segmentation,
  });

  if (!contours?.length || !contours[0].sliceContours.length) {
    return;
  }

  const {
    representationData,
    segments = [
      null,
      { label: 'Unspecified', color: null, containedSegmentIndices: null },
    ],
  } = segmentation;
  const { volumeId: segVolumeId } = representationData[Labelmap];

  const segmentIndex = segments.findIndex((it) => !!it);
  if (segmentIndex === -1) {
    return;
  }
  segments[segmentIndex].segmentIndex = segmentIndex;
  return findLargestBidirectional(
    contours[0],
    segVolumeId,
    segments[segmentIndex]
  );
}
