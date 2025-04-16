import type { Types as ToolsTypes } from '@cornerstonejs/tools';
import { Enums, segmentation, utilities } from '@cornerstonejs/tools';

type RepresentationsData = ToolsTypes.RepresentationsData;

const { getSegmentation } = segmentation.state;
const { validateLabelmap } = utilities.segmentation;

// Map of conversion paths between source and target representations
// You should read it as "source" -> "targets"
const conversionPaths = new Map([
  [
    Enums.SegmentationRepresentations.Labelmap,
    new Set([
      Enums.SegmentationRepresentations.Surface,
      Enums.SegmentationRepresentations.Contour,
    ]),
  ],
  [
    Enums.SegmentationRepresentations.Contour,
    new Set([
      Enums.SegmentationRepresentations.Labelmap,
      Enums.SegmentationRepresentations.Surface,
    ]),
  ],
  [
    Enums.SegmentationRepresentations.Surface,
    new Set([Enums.SegmentationRepresentations.Labelmap]),
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
  representationType: Enums.SegmentationRepresentations
): boolean {
  const { representationData } = getSegmentation(segmentationId);

  const existingRepresentationTypes =
    getExistingRepresentationTypes(representationData);

  return existingRepresentationTypes.some((existingRepresentationType) =>
    canConvertFromTo(existingRepresentationType, representationType)
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
      case Enums.SegmentationRepresentations.Labelmap:
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
