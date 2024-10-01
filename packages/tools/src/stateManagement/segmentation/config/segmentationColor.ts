import type { Types } from '@cornerstonejs/core';
import { addColorLUT as _addColorLUT } from '../addColorLUT';
import { getColorLUT as _getColorLUT } from '../getColorLUT';
import { getSegmentationRepresentations } from '../getSegmentationRepresentation';
import { triggerSegmentationRepresentationModified } from '../triggerSegmentationEvents';

/**
 * addColorLUT - Adds a new color LUT to the state at the given colorLUTIndex.
 * If no colorLUT is provided, a new color LUT is generated.
 *
 * @param colorLUT - An array of The colorLUT to set.
 * @param colorLUTIndex - the index of the colorLUT in the state
 * @returns The index of the color LUT that was added.
 */
function addColorLUT(colorLUT: Types.ColorLUT, colorLUTIndex?: number): number {
  if (!colorLUT) {
    throw new Error('addColorLUT: colorLUT is required');
  }

  return _addColorLUT(colorLUT, colorLUTIndex);
}

/**
 * Sets the color LUT index for a segmentation in a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @param segmentationId - The ID of the segmentation.
 * @param colorLUTIndex - The index of the color LUT to set.
 */
function setColorLUT(
  viewportId: string,
  segmentationId: string,
  colorLUTsIndex: number
): void {
  if (!_getColorLUT(colorLUTsIndex)) {
    throw new Error(
      `setColorLUT: could not find colorLUT with index ${colorLUTsIndex}`
    );
  }

  const segmentationRepresentations = getSegmentationRepresentations(
    viewportId,
    { segmentationId }
  );

  if (!segmentationRepresentations) {
    throw new Error(
      `viewport specific state for viewport ${viewportId} does not exist`
    );
  }

  segmentationRepresentations.forEach((segmentationRepresentation) => {
    segmentationRepresentation.colorLUTIndex = colorLUTsIndex;
  });

  triggerSegmentationRepresentationModified(viewportId, segmentationId);
}

/**
 * Given a segmentation representationUID and a segment index, return the
 * color for that segment. It can be used for segmentation tools that need to
 * display the color of their annotation.
 *
 * @param viewportId - The id of the viewport
 * @param segmentationId - The id of the segmentation
 * @param segmentIndex - The index of the segment in the segmentation
 * @returns A color.
 */
function getSegmentIndexColor(
  viewportId: string,
  segmentationId: string,
  segmentIndex: number
): Types.Color {
  const representations = getSegmentationRepresentations(viewportId, {
    segmentationId,
  });

  if (!representations) {
    throw new Error(
      `segmentation representation with segmentationId ${segmentationId} does not exist`
    );
  }

  const representation = representations[0];

  const { colorLUTIndex } = representation;

  // get colorLUT
  const colorLUT = _getColorLUT(colorLUTIndex);
  let colorValue = colorLUT[segmentIndex];
  if (!colorValue) {
    if (typeof segmentIndex !== 'number') {
      throw new Error(`Can't create colour for LUT index ${segmentIndex}`);
    }
    colorValue = colorLUT[segmentIndex] = [0, 0, 0, 0];
  }
  return colorValue;
}

/**
 * Sets the color for a specific segment in a segmentation.
 *
 * @param viewportId - The ID of the viewport containing the segmentation.
 * @param segmentationId - The ID of the segmentation to modify.
 * @param segmentIndex - The index of the segment to change the color for.
 * @param color - The new color to set for the segment.
 *
 * @remarks
 * This function modifies the color of a specific segment in the color lookup table (LUT)
 * for the given segmentation. It directly updates the color reference in the LUT,
 * ensuring that all representations of this segmentation will reflect the new color.
 * After updating the color, it triggers a segmentation modified event to notify
 * listeners of the change.
 *
 * @example
 * ```typescript
 * setSegmentIndexColor('viewport1', 'segmentation1', 2, [255, 0, 0, 255]);
 * ```
 */
function setSegmentIndexColor(
  viewportId: string,
  segmentationId: string,
  segmentIndex: number,
  color: Types.Color
): void {
  // Get the reference to the color in the colorLUT.
  const colorReference = getSegmentIndexColor(
    viewportId,
    segmentationId,
    segmentIndex
  );

  // Modify the values by reference
  for (let i = 0; i < color.length; i++) {
    colorReference[i] = color[i];
  }

  triggerSegmentationRepresentationModified(viewportId, segmentationId);
}

export { getSegmentIndexColor, addColorLUT, setColorLUT, setSegmentIndexColor };
