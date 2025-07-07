import { generateContourSetsFromLabelmap } from '../contours';
import findLargestBidirectional from './findLargestBidirectional';
import getOrCreateSegmentationVolume from './getOrCreateSegmentationVolume';

// Types for clarity and safety
interface Segment {
  label: string;
  color?: [number, number, number] | string | null;
  containedSegmentIndices?: number[] | null;
  segmentIndex?: number;
}
interface Segmentation {
  segments: (Segment | null)[];
  segmentationId: string;
  // ...other properties as needed
}

/**
 * Generates a contour object over the segment, and then uses the contouring to
 * find the largest bidirectional object (by area: maxMajor * maxMinor) that can be applied
 * within the acquisition plane for the first non-null segment in the segmentation.
 *
 * If multiple volumes are present (multi-volume segmentation), the largest bidirectional
 * across all volumes is returned.
 *
 * @param segmentation - The segmentation object containing segments and metadata.
 * @returns The largest bidirectional object found (by area) for the first non-null segment, or undefined if none found.
 */
export default async function contourAndFindLargestBidirectional(
  segmentation: Segmentation
): Promise<ReturnType<typeof findLargestBidirectional> | undefined> {
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

  const volumes = getOrCreateSegmentationVolume(segmentation.segmentationId);
  if (!volumes) {
    return;
  }

  // Pick the first non-null segment as before
  const segmentIndex = segments.findIndex((it) => !!it);
  if (segmentIndex === -1) {
    return;
  }
  // Mutate segment to record its index for downstream logic
  if (segments[segmentIndex]) {
    segments[segmentIndex]!.segmentIndex = segmentIndex;
  }

  // Loop over all volumes and return the largest bidirectional (by area)
  let largest: ReturnType<typeof findLargestBidirectional> | undefined =
    undefined;
  let largestArea = -Infinity;
  for (const vol of volumes) {
    const result = findLargestBidirectional(
      contours[0],
      vol.volumeId,
      segments[segmentIndex]!
    );
    if (
      result &&
      typeof result.maxMajor === 'number' &&
      typeof result.maxMinor === 'number'
    ) {
      const area = result.maxMajor * result.maxMinor;
      if (area > largestArea) {
        largest = result;
        largestArea = area;
      }
    }
  }
  return largest;
}
