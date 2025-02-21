import { SegmentationRepresentations } from '@cornerstonejs/tools/enums';
import type { RepresentationsData } from '@cornerstonejs/tools/types';
import { state } from '@cornerstonejs/tools/segmentation';
import { segmentation as segUtils } from '@cornerstonejs/tools/utilities';

const { getSegmentation } = state;
const { validateLabelmap } = segUtils;

// Map of conversion paths between source and target representations
// You should read it as "source" -> "targets"
const conversionPaths = new Map<
  SegmentationRepresentations,
  Set<SegmentationRepresentations>
>([
  [
    SegmentationRepresentations.Labelmap,
    new Set([
      SegmentationRepresentations.Surface,
      SegmentationRepresentations.Contour,
    ]),
  ],
  [
    SegmentationRepresentations.Contour,
    new Set([
      SegmentationRepresentations.Labelmap,
      SegmentationRepresentations.Surface,
    ]),
  ],
  [
    SegmentationRepresentations.Surface,
    new Set([SegmentationRepresentations.Labelmap]),
  ],
]);

/**
 * Determines whether the requested representation can be computed, based on
 * the existing representation types and available conversion paths.
 * This is used in the labelmapDisplay and surfaceDisplay logic if the
 * requested representation is not available whether we can use the existing
 * representation to compute the requested representation. You can checkout the polySeg
 * examples to see how this is used polyDataActorManipulationTools and others
 *
 * @param segmentationId - The id of the segmentation
 * @param representationType - The type of the representation to compute
 * @returns true if the representation can be computed, false otherwise
 */
function canComputeRequestedRepresentation(
  segmentationId: string,
  type: SegmentationRepresentations
): boolean {
  const { representationData } = getSegmentation(segmentationId);

  const existingRepresentationTypes =
    getExistingRepresentationTypes(representationData);

  return existingRepresentationTypes.some((existingRepresentationType) =>
    canConvertFromTo(existingRepresentationType, type)
  );
}

/**
 * Retrieves the existing representation types for the given representationData
 * by verifying the validity of each representation type.
 *
 * @param representationData - The representation data
 * @returns supportedTypes - An array of valid representation types
 */
function getExistingRepresentationTypes(
  representationData: RepresentationsData
): string[] {
  const supportedTypes: string[] = [];

  Object.keys(representationData).forEach((representationType) => {
    const representationTypeData = representationData[representationType];

    let validateFn;
    switch (representationType) {
      case SegmentationRepresentations.Labelmap:
        validateFn = validateLabelmap.validate;
        break;
      // Todo: add validation for other representation types
    }

    if (validateFn) {
      try {
        validateFn(representationTypeData);
        supportedTypes.push(representationType);
      } catch (error) {
        console.warn(
          `Validation failed for labelmap of type ${representationType}`
        );
      }
    } else {
      supportedTypes.push(representationType);
    }
  });

  return supportedTypes;
}

async function canConvertFromTo(fromRepresentationType, toRepresentationType) {
  return (
    conversionPaths.get(fromRepresentationType)?.has(toRepresentationType) ||
    false
  );
}

export { canComputeRequestedRepresentation };
