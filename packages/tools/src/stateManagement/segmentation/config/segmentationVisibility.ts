import { cache, Types } from '@cornerstonejs/core';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { getSegmentationRepresentations } from '../../../stateManagement/segmentation/segmentationState';
import { ToolGroupSpecificRepresentation } from '../../../types/SegmentationStateTypes';
import { triggerSegmentationRepresentationModified } from '../triggerSegmentationEvents';
import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';

function getSegmentationIndices(segmentationId) {
  const segmentation = SegmentationState.getSegmentation(segmentationId);

  if (segmentation.type === SegmentationRepresentations.Labelmap) {
    const volume = cache.getVolume(segmentationId);
    const scalarData = volume.getScalarData();

    const keySet = {};
    scalarData.forEach((it) => (keySet[it] = it));
    return Object.keys(keySet).map((it) => parseInt(it, 10));
  } else if (segmentation.type === SegmentationRepresentations.Contour) {
    const geometryIds = segmentation.representationData.CONTOUR?.geometryIds;

    if (!geometryIds) {
      throw new Error(
        `No geometryIds found for segmentationId ${segmentationId}`
      );
    }

    return geometryIds.map((geometryId) => {
      const geometry = cache.getGeometry(geometryId) as Types.IGeometry;
      return (geometry.data as Types.IContourSet).getSegmentIndex();
    });
  }
}

/**
 * Set the visibility of a segmentation representation for a given tool group. It fires
 * a SEGMENTATION_REPRESENTATION_MODIFIED event. Visibility true will show all segments
 * and visibility false will hide all segments"
 *
 * @triggers SEGMENTATION_REPRESENTATION_MODIFIED
 * @param toolGroupId - The Id of the tool group that contains the segmentation.
 * @param segmentationRepresentationUID - The id of the segmentation representation to modify its visibility.
 * @param visibility - boolean
 */
function setSegmentationVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  visibility: boolean
): void {
  const toolGroupSegmentationRepresentations =
    getSegmentationRepresentations(toolGroupId);

  if (!toolGroupSegmentationRepresentations) {
    return;
  }

  const representation = toolGroupSegmentationRepresentations.find(
    (representation: ToolGroupSpecificRepresentation) =>
      representation.segmentationRepresentationUID ===
      segmentationRepresentationUID
  );

  if (!representation) {
    return;
  }

  const { segmentsHidden, segmentationId } = representation;

  const indices = getSegmentationIndices(segmentationId);

  // if visibility is set to be true, we need to remove all the segments
  // from the segmentsHidden set, otherwise we need to add all the segments
  // to the segmentsHidden set
  if (visibility) {
    segmentsHidden.clear();
  } else {
    indices.forEach((index) => {
      segmentsHidden.add(index);
    });
  }

  triggerSegmentationRepresentationModified(
    toolGroupId,
    representation.segmentationRepresentationUID
  );
}

/**
 * Get the visibility of a segmentation data for a given tool group.
 *
 * @param toolGroupId - The Id of the tool group that the segmentation
 * data belongs to.
 * @param segmentationRepresentationUID - The id of the segmentation data to get
 * @returns A boolean value that indicates whether the segmentation data is visible or
 * not on the toolGroup
 */
function getSegmentationVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string
): boolean | undefined {
  const toolGroupSegmentationRepresentations =
    getSegmentationRepresentations(toolGroupId);

  const representation = toolGroupSegmentationRepresentations.find(
    (representation: ToolGroupSpecificRepresentation) =>
      representation.segmentationRepresentationUID ===
      segmentationRepresentationUID
  );

  if (!representation) {
    return;
  }

  const { segmentsHidden } = representation;

  return segmentsHidden.size === 0;
}

/**
 * Set the visibility of the given segment indices to the given visibility. This
 * is a helper to set the visibility of multiple segments at once and reduces
 * the number of events fired.
 *
 * @param toolGroupId -  The tool group id of the segmentation representation.
 * @param segmentationRepresentationUID -  The UID of the segmentation
 * representation.
 * @param segmentIndices -  The indices of the segments to be hidden/shown.
 * @param visibility -  The visibility to set the segments to.
 *
 */
function setSegmentsVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndices: number[],
  visibility: boolean
): void {
  const segRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      toolGroupId,
      segmentationRepresentationUID
    );

  if (!segRepresentation) {
    return;
  }

  segmentIndices.forEach((segmentIndex) => {
    visibility
      ? segRepresentation.segmentsHidden.delete(segmentIndex)
      : segRepresentation.segmentsHidden.add(segmentIndex);
  });

  triggerSegmentationRepresentationModified(
    toolGroupId,
    segmentationRepresentationUID
  );
}

function setSegmentVisibility(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number,
  visibility: boolean
): void {
  const segRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      toolGroupId,
      segmentationRepresentationUID
    );

  if (!segRepresentation) {
    return;
  }

  visibility
    ? segRepresentation.segmentsHidden.delete(segmentIndex)
    : segRepresentation.segmentsHidden.add(segmentIndex);

  triggerSegmentationRepresentationModified(
    toolGroupId,
    segmentationRepresentationUID
  );
}

export {
  setSegmentationVisibility,
  getSegmentationVisibility,
  setSegmentVisibility,
  setSegmentsVisibility,
};
