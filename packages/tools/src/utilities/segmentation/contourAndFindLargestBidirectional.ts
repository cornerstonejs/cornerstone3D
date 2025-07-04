import { generateContourSetsFromLabelmap } from '../contours';
import findLargestBidirectional from './findLargestBidirectional';
import getOrCreateSegmentationVolume from './getOrCreateSegmentationVolume';

/**
 * Generates a contour object over the segment, and then uses the contouring to
 * find the largest bidirectional object (by area: maxMajor * maxMinor) that can be applied
 * within the acquisition plane for the first non-null segment in the segmentation.
 *
 * If multiple volumes are present (multi-volume segmentation), the largest bidirectional
 * across all volumes is returned.
 *
 * @param segmentation - The segmentation object containing segments and metadata.
 * @param segmentation.segments - A list of segments to apply the contour to.
 * @param segmentation.segments.containedSegmentIndices - A set of segment indexes equivalent to the primary segment.
 * @param segmentation.segments.label - The label for the segment.
 * @param segmentation.segments.color - The color to use for the segment label.
 * @returns The largest bidirectional object found (by area) for the first non-null segment, or undefined if none found.
 */
export default async function contourAndFindLargestBidirectional(segmentation) {
  const contours = await generateContourSetsFromLabelmap({
    segmentations: segmentation,
  });

  if (!contours?.length || !contours[0].sliceContours.length) {
    return;
  }

  const {
    segments = [
      null,
      { label: 'Unspecified', color: null, containedSegmentIndices: null },
    ],
  } = segmentation;

  const vol = getOrCreateSegmentationVolume(segmentation.segmentationId);
  if (!vol) {
    return;
  }
  const volumes = Array.isArray(vol) ? vol : [vol];

  // Pick the first non-null segment as before
  const segmentIndex = segments.findIndex((it) => !!it);
  if (segmentIndex === -1) {
    return;
  }
  segments[segmentIndex].segmentIndex = segmentIndex;

  // Loop over all volumes and return the largest bidirectional (by area)
  let largest = undefined;
  let largestArea = -Infinity;
  for (const vol of volumes) {
    const result = findLargestBidirectional(
      contours[0],
      vol.volumeId,
      segments[segmentIndex]
    );
    if (result) {
      const area = result.maxMajor * result.maxMinor;
      if (area > largestArea) {
        largest = result;
        largestArea = area;
      }
    }
  }
  return largest;
}
