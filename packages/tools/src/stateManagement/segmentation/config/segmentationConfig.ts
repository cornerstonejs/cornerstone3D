import type SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import { segmentationStyle } from '../SegmentationStyle';
import type { RepresentationStyle } from '../SegmentationStyle';

/**
 * It returns the global segmentation style.
 * @param specifier - An object containing the specifications for the global style.
 * @param specifier.type - The type of segmentation representation.
 * @returns The global segmentation style containing the representations
 * style for each representation type.
 */
function getGlobalStyle(
  representationType: SegmentationRepresentations
): RepresentationStyle {
  return segmentationStyle.getGlobalStyle(representationType);
}

/**
 * Set the global segmentation style
 * @param type - The type of segmentation representation.
 * @param style - The style to be set globally.
 */
function setGlobalStyle(
  representationType: SegmentationRepresentations,
  style: RepresentationStyle
): void {
  segmentationStyle.setGlobalStyle(type, style);
}

/**
 * Retrieves the style for all segments of a given segmentation representation.
 *
 * @param specifier - An object containing the specifications for the segmentation representation style.
 * @param specifier.viewportId - The ID of the viewport.
 * @param specifier.segmentationId - The ID of the segmentation.
 * @param specifier.representationType - The type of segmentation representation.
 * @returns The representation style for all segments.
 */
function getSegmentationRepresentationStyle(specifier: {
  viewportId: string;
  segmentationId: string;
  representationType: SegmentationRepresentations;
}): RepresentationStyle {
  return segmentationStyle.getSegmentationStyle(specifier);
}

/**
 * Sets the style for all segments of a given segmentation representation.
 *
 * @param specifier - An object containing the specifications for the segmentation representation style.
 * @param specifier.viewportId - The ID of the viewport.
 * @param specifier.segmentationId - The ID of the segmentation.
 * @param specifier.representationType - The type of segmentation representation.
 * @param specifier.style - The style to be set for all segments.
 */
function setSegmentationRepresentationStyle(specifier: {
  viewportId: string;
  segmentationId: string;
  representationType: SegmentationRepresentations;
  style: RepresentationStyle;
}): void {
  const { style, ...rest } = specifier;
  segmentationStyle.setViewportStyle(rest, style);
}

/**
 * Sets the style that is specific to each segment in the segmentation representation.
 * Note this is setting style for each segment in bulk
 *
 * @param specifier - An object containing the specifications for the segmentation representation style.
 * @param specifier.viewportId - The ID of the viewport.
 * @param specifier.segmentationId - The ID of the segmentation.
 * @param specifier.representationType - The type of segmentation representation.
 * @param specifier.style - The style to be set for the segmentation representation.
 */
function setPerSegmentStyle(specifier: {
  viewportId: string;
  segmentationId: string;
  representationType: SegmentationRepresentations;
  style: Record<number, RepresentationStyle>;
}): void {
  const { style, ...rest } = specifier;
  Object.entries(style).forEach(([segmentIndex, segmentStyle]) => {
    segmentationStyle.setViewportStyle(
      {
        ...rest,
        segmentIndex: Number(segmentIndex),
      },
      segmentStyle
    );
  });
}

/**
 * Retrieves the segment representation style for a given segmentation.
 *
 * @param specifier - An object containing the specifications for the segmentation representation style.
 * @param specifier.viewportId - The ID of the viewport.
 * @param specifier.segmentationId - The ID of the segmentation.
 * @param specifier.representationType - The type of segmentation representation.
 * @returns The segment representation style.
 */
function getPerSegmentStyle(specifier: {
  viewportId: string;
  segmentationId: string;
  representationType: SegmentationRepresentations;
}): Record<number, RepresentationStyle> {
  // This function needs to be implemented in SegmentationStyle class
  // For now, we'll return an empty object
  return {};
}

/**
 * Sets the style for a specific segment index in a segmentation representation.
 *
 * @param specifier - An object containing the specifications for the segmentation representation style.
 * @param specifier.viewportId - The ID of the viewport.
 * @param specifier.segmentationId - The ID of the segmentation.
 * @param specifier.representationType - The type of segmentation representation.
 * @param specifier.segmentIndex - The index of the segment.
 * @param specifier.style - The style to set for the segment.
 */
function setSegmentIndexStyle(specifier: {
  viewportId: string;
  segmentationId: string;
  representationType: SegmentationRepresentations;
  segmentIndex: number;
  style: RepresentationStyle;
}): void {
  const { style, ...rest } = specifier;
  segmentationStyle.setViewportStyle(rest, style);
}

/**
 * Get the segment specific style for the segmentation representation.
 *
 * @param specifier - An object containing the specifications for the segmentation representation style.
 * @param specifier.viewportId - The ID of the viewport.
 * @param specifier.segmentationId - The ID of the segmentation.
 * @param specifier.representationType - The type of segmentation representation.
 * @param specifier.segmentIndex - The index of the segment
 * @returns - The style for the segment index in the segmentation representation
 */
function getSegmentIndexStyle(specifier: {
  viewportId: string;
  segmentationId: string;
  representationType: SegmentationRepresentations;
  segmentIndex: number;
}): RepresentationStyle {
  return segmentationStyle.getSegmentationStyle(specifier);
}

export {
  // Global
  getGlobalStyle,
  setGlobalStyle,
  // segmentation representation style
  getSegmentationRepresentationStyle,
  setSegmentationRepresentationStyle,
  setPerSegmentStyle,
  getPerSegmentStyle,
  // segment index get/set
  setSegmentIndexStyle,
  getSegmentIndexStyle,
};
