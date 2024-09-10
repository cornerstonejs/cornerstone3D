import { SegmentationRepresentations } from '../../enums';
import type { RepresentationPublicInput } from '../../types/SegmentationStateTypes';
import { internalAddSegmentationRepresentation } from './internalAddSegmentationRepresentation';

/**
 * Adds one or more segmentations to a specific viewport.
 */
async function addSegmentationToViewport(
  viewportId: string,
  segmentationInputArray: RepresentationPublicInput[]
) {
  const promises = segmentationInputArray.map((segmentationInput) => {
    return internalAddSegmentationRepresentation(viewportId, segmentationInput);
  });

  Promise.all(promises);
}

/**
 * Adds one or more contour segmentations to a specific viewport.
 *
 * @param viewportId - The identifier of the viewport to add the contour segmentations to.
 * @param contourInputArray - An array of contour segmentation inputs to be added.
 * @returns A promise that resolves to an array of segmentation representation UIDs.
 */
async function addContourRepresentationToViewport(
  viewportId: string,
  contourInputArray: RepresentationPublicInput[]
) {
  return addSegmentationToViewport(
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
async function addContourRepresentationToViewportMap(viewportInputMap: {
  [viewportId: string]: RepresentationPublicInput[];
}): Promise<{ [viewportId: string]: string[] }> {
  const results = {};

  for (const [viewportId, inputArray] of Object.entries(viewportInputMap)) {
    results[viewportId] = await addContourRepresentationToViewport(
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
async function addLabelmapRepresentationToViewport(
  viewportId: string,
  labelmapInputArray: RepresentationPublicInput[]
) {
  return addSegmentationToViewport(
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
async function addLabelmapRepresentationToViewportMap(viewportInputMap: {
  [viewportId: string]: RepresentationPublicInput[];
}): Promise<{ [viewportId: string]: string[] }> {
  const results = {};

  for (const [viewportId, inputArray] of Object.entries(viewportInputMap)) {
    results[viewportId] = await addLabelmapRepresentationToViewport(
      viewportId,
      inputArray.map((input) => ({
        ...input,
        type: SegmentationRepresentations.Labelmap,
      }))
    );
  }

  return results;
}

/**
 * Adds one or more surface segmentations to a specific viewport.
 *
 * @param viewportId - The identifier of the viewport to add the surface segmentations to.
 * @param surfaceInputArray - An array of surface segmentation inputs to be added.
 * @returns A promise that resolves to an array of segmentation representation UIDs.
 */
async function addSurfaceRepresentationToViewport(
  viewportId: string,
  surfaceInputArray: RepresentationPublicInput[]
) {
  return addSegmentationToViewport(
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
async function addSurfaceRepresentationToViewportMap(viewportInputMap: {
  [viewportId: string]: RepresentationPublicInput[];
}): Promise<{ [viewportId: string]: string[] }> {
  const results = {};

  for (const [viewportId, inputArray] of Object.entries(viewportInputMap)) {
    results[viewportId] = await addSurfaceRepresentationToViewport(
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
