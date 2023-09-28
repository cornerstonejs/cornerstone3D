import { utilities } from '@cornerstonejs/core';
import * as SegmentationState from '../../../stateManagement/segmentation/segmentationState';
import { Color } from '../../../types/SegmentationStateTypes';
import { ColorLUT } from '../../../types/SegmentationStateTypes';
import { triggerSegmentationRepresentationModified } from '../triggerSegmentationEvents';
import { SegmentationRepresentations } from '../../../enums';

/**
 * addColorLUT - Adds a new color LUT to the state at the given colorLUTIndex.
 * If no colorLUT is provided, a new color LUT is generated.
 *
 * @param colorLUTIndex - the index of the colorLUT in the state
 * @param colorLUT - An array of The colorLUT to set.
 * @returns
 */
function addColorLUT(colorLUT: ColorLUT, colorLUTIndex: number): void {
  if (!colorLUT) {
    throw new Error('addColorLUT: colorLUT is required');
  }

  // Append the "zero" (no label) color to the front of the LUT, if necessary.
  if (!utilities.isEqual(colorLUT[0], [0, 0, 0, 0])) {
    console.warn(
      'addColorLUT: [0, 0, 0, 0] color is not provided for the background color (segmentIndex =0), automatically adding it'
    );
    colorLUT.unshift([0, 0, 0, 0]);
  }

  SegmentationState.addColorLUT(colorLUT, colorLUTIndex);
}

/**
 * It sets the toolGroup's segmentationRepresentation to use the provided
 * colorLUT at the given colorLUTIndex.
 * @param toolGroupId - the id of the toolGroup that renders the representation
 * @param segmentationRepresentationUID - the representationUID for the segmentation
 * @param colorLUTIndex - the index of the colorLUT to use
 */
function setColorLUT(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  colorLUTIndex: number
): void {
  const segRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      toolGroupId,
      segmentationRepresentationUID
    );

  if (!segRepresentation) {
    throw new Error(
      `setColorLUT: could not find segmentation representation with UID ${segmentationRepresentationUID}`
    );
  }

  if (!SegmentationState.getColorLUT(colorLUTIndex)) {
    throw new Error(
      `setColorLUT: could not find colorLUT with index ${colorLUTIndex}`
    );
  }

  segRepresentation.colorLUTIndex = colorLUTIndex;

  triggerSegmentationRepresentationModified(
    toolGroupId,
    segmentationRepresentationUID
  );
}

/**
 * Given a tool group UID, a segmentation representationUID, and a segment index, return the
 * color for that segment. It can be used for segmentation tools that need to
 * display the color of their annotation.
 *
 * @param toolGroupId - The Id of the tool group that owns the segmentation representation.
 * @param segmentationRepresentationUID - The uid of the segmentation representation
 * @param segmentIndex - The index of the segment in the segmentation
 * @returns A color.
 */
function getColorForSegmentIndex(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number
): Color {
  const segmentationRepresentation =
    SegmentationState.getSegmentationRepresentationByUID(
      toolGroupId,
      segmentationRepresentationUID
    );

  if (!segmentationRepresentation) {
    throw new Error(
      `segmentation representation with UID ${segmentationRepresentationUID} does not exist for tool group ${toolGroupId}`
    );
  }

  const { colorLUTIndex } = segmentationRepresentation;

  // get colorLUT
  const colorLUT = SegmentationState.getColorLUT(colorLUTIndex);
  return colorLUT[segmentIndex];
}

function setColorForSegmentIndex(
  toolGroupId: string,
  segmentationRepresentationUID: string,
  segmentIndex: number,
  color: Color
): void {
  // Get the reference to the color in the colorLUT.
  const colorReference = getColorForSegmentIndex(
    toolGroupId,
    segmentationRepresentationUID,
    segmentIndex
  );

  // Modify the values by reference
  for (let i = 0; i < color.length; i++) {
    colorReference[i] = color[i];
  }

  triggerSegmentationRepresentationModified(
    toolGroupId,
    segmentationRepresentationUID
  );
}

export {
  getColorForSegmentIndex,
  addColorLUT,
  setColorLUT,
  setColorForSegmentIndex,
};
