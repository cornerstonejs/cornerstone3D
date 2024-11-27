import { SegmentationRepresentations } from '../../enums';
import type { RepresentationPublicInput } from '../../types/SegmentationStateTypes';
import { internalAddSegmentationRepresentation } from './internalAddSegmentationRepresentation';

/**
 * Adds one or more segmentations to a specific viewport.
 */
export function addSegmentationRepresentations(
  viewportId: string,
  segmentationInputArray: RepresentationPublicInput[]
) {
  segmentationInputArray.map((segmentationInput) => {
    return internalAddSegmentationRepresentation(viewportId, segmentationInput);
  });
}

/**
 * Adds one or more contour segmentations to a specific viewport.
 *
 * @param viewportId - The identifier of the viewport to add the contour segmentations to.
 * @param contourInputArray - An array of contour segmentation inputs to be added.
 * @returns A promise that resolves to an array of segmentation representation UIDs.
 */
function addContourRepresentationToViewport(
  viewportId: string,
  contourInputArray: RepresentationPublicInput[]
) {
  return addSegmentationRepresentations(
    viewportId,
    contourInputArray.map((input) => ({
      ...input,
      type: SegmentationRepresentations.Contour,
    }))
  );
}

/**
 * Adds multiple contour segmentations to multiple viewports.
 *
 * @param viewportInputMap - An object mapping viewport IDs to arrays of contour segmentation inputs.
 * @returns A promise that resolves to an object mapping viewport IDs to arrays of segmentation representation UIDs.
 */
function addContourRepresentationToViewportMap(viewportInputMap: {
  [viewportId: string]: RepresentationPublicInput[];
}) {
  const results = {};

  for (const [viewportId, inputArray] of Object.entries(viewportInputMap)) {
    results[viewportId] = addContourRepresentationToViewport(
      viewportId,
      inputArray
    );
  }

  return results;
}

/**
 * Adds one or more labelmap segmentations to a specific viewport.
 *
 * @param viewportId - The identifier of the viewport to add the labelmap segmentations to.
 * @param labelmapInputArray - An array of labelmap segmentation inputs to be added.
 * @returns A promise that resolves to an array of segmentation representation UIDs.
 */
function addLabelmapRepresentationToViewport(
  viewportId: string,
  labelmapInputArray: RepresentationPublicInput[]
) {
  return addSegmentationRepresentations(
    viewportId,
    labelmapInputArray.map((input) => ({
      ...input,
      type: SegmentationRepresentations.Labelmap,
    }))
  );
}

/**
 * Adds multiple labelmap segmentations to multiple viewports.
 *
 * @param viewportInputMap - An object mapping viewport IDs to arrays of labelmap segmentation inputs.
 * @returns A promise that resolves to an object mapping viewport IDs to arrays of segmentation representation UIDs.
 */
function addLabelmapRepresentationToViewportMap(viewportInputMap: {
  [viewportId: string]: RepresentationPublicInput[];
}) {
  const results = {};

  for (const [viewportId, inputArray] of Object.entries(viewportInputMap)) {
    results[viewportId] = addLabelmapRepresentationToViewport(
      viewportId,
      inputArray.map((input) => ({
        ...input,
        type: SegmentationRepresentations.Labelmap,
      }))
    );
  }
}

/**
 * Adds one or more surface segmentations to a specific viewport.
 *
 * @param viewportId - The identifier of the viewport to add the surface segmentations to.
 * @param surfaceInputArray - An array of surface segmentation inputs to be added.
 * @returns A promise that resolves to an array of segmentation representation UIDs.
 */
function addSurfaceRepresentationToViewport(
  viewportId: string,
  surfaceInputArray: RepresentationPublicInput[]
) {
  return addSegmentationRepresentations(
    viewportId,
    surfaceInputArray.map((input) => ({
      ...input,
      type: SegmentationRepresentations.Surface,
    }))
  );
}

/**
 * Adds multiple surface segmentations to multiple viewports.
 *
 * @param viewportInputMap - An object mapping viewport IDs to arrays of surface segmentation inputs.
 * @returns A promise that resolves to an object mapping viewport IDs to arrays of segmentation representation UIDs.
 */
function addSurfaceRepresentationToViewportMap(viewportInputMap: {
  [viewportId: string]: RepresentationPublicInput[];
}) {
  const results = {};

  for (const [viewportId, inputArray] of Object.entries(viewportInputMap)) {
    results[viewportId] = addSurfaceRepresentationToViewport(
      viewportId,
      inputArray
    );
  }

  return results;
}

export {
  addContourRepresentationToViewport,
  addLabelmapRepresentationToViewport,
  addSurfaceRepresentationToViewport,
  // Multi viewport functions
  addContourRepresentationToViewportMap,
  addLabelmapRepresentationToViewportMap,
  addSurfaceRepresentationToViewportMap,
};
