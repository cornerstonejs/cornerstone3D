import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import type { ContourStyle } from '../../../types/ContourTypes';
import type { LabelmapStyle } from '../../../types/LabelmapTypes';
import type { SurfaceStyle } from '../../../types/SurfaceTypes';
import { triggerSegmentationRender } from '../SegmentationRenderingEngine';
import { segmentationStyle } from '../SegmentationStyle';
import type { RepresentationStyle } from '../SegmentationStyle';

/**
 * Get the style for a given segmentation representation.
 * @param specifier The specifier object containing the viewportId, segmentationId, representationType, and segmentIndex.
 * @returns The style for the given segmentation representation.
 */
function getStyle(specifier: {
  viewportId?: string;
  segmentationId?: string;
  representationType?: SegmentationRepresentations;
  segmentIndex?: number;
}): { style: RepresentationStyle; renderInactiveSegmentations: boolean } {
  return segmentationStyle.getStyle(specifier);
}

/**
 * Get the global segmentation style for a specific representation type.
 * @param representationType - The type of segmentation representation.
 * @returns The global segmentation style for the specified representation type.
 */
function getGlobalStyle(
  representationType: SegmentationRepresentations
): RepresentationStyle {
  return segmentationStyle.getGlobalStyle(representationType);
}

/**
 * Set the global segmentation style for a specific representation type.
 * @param representationType - The type of segmentation representation.
 * @param style - The style to be set globally.
 */
function setGlobalStyle(
  representationType: SegmentationRepresentations,
  style: RepresentationStyle
): void {
  segmentationStyle.setGlobalStyle(representationType, style);
  triggerSegmentationRender();
}

/**
 * Set the global labelmap style.
 * @param style - The labelmap style to be set globally.
 */
function setGlobalLabelmapStyle(style: LabelmapStyle): void {
  segmentationStyle.setGlobalLabelmapStyle(style);
  triggerSegmentationRender();
}

/**
 * Set the global contour style.
 * @param style - The contour style to be set globally.
 */
function setGlobalContourStyle(style: ContourStyle): void {
  segmentationStyle.setGlobalContourStyle(style);
  triggerSegmentationRender();
}

/**
 * Set the global surface style.
 * @param style - The surface style to be set globally.
 */
function setGlobalSurfaceStyle(style: SurfaceStyle): void {
  segmentationStyle.setGlobalSurfaceStyle(style);
  triggerSegmentationRender();
}

/**
 * Sets the style for a specific segmentation across all viewports.
 * @param specifier - An object containing the specifications for the segmentation style.
 * @param style - The style to be set for the segmentation.
 */
function setSegmentationSpecificStyle(
  specifier: {
    segmentationId: string;
    representationType: SegmentationRepresentations;
    segmentIndex?: number;
  },
  style: RepresentationStyle
): void {
  segmentationStyle.setSegmentationSpecificStyle(specifier, style);
  triggerSegmentationRender();
}

/**
 * Sets the style for a labelmap segmentation representation across all viewports.
 * @param specifier - An object containing the specifications for the labelmap style.
 * @param style - The labelmap style to be set.
 */
function setLabelmapStyle(
  specifier: {
    segmentationId: string;
  },
  style: LabelmapStyle
): void {
  setSegmentationSpecificStyle(
    {
      ...specifier,
      representationType: SegmentationRepresentations.Labelmap,
    },
    style
  );
}

/**
 * Sets the style for all segmentations of a specific representation type in a viewport.
 * @param specifier - An object containing the specifications for the viewport-specific style.
 * @param style - The style to be set for the representation type in the specified viewport.
 */
function setViewportSpecificStyleForRepresentationType(
  specifier: {
    viewportId: string;
    representationType: SegmentationRepresentations;
  },
  style: RepresentationStyle
): void {
  segmentationStyle.setViewportSpecificStyleForRepresentationType(
    specifier,
    style
  );
  triggerSegmentationRender(specifier.viewportId);
}

/**
 * Sets the style for a specific segmentation and representation type in a specific viewport.
 * @param specifier - An object containing the specifications for the viewport-specific segmentation style.
 * @param style - The style to be set for the segmentation in the specified viewport.
 */
function setViewportSpecificStyleForSegmentation(
  specifier: {
    viewportId: string;
    segmentationId: string;
    representationType: SegmentationRepresentations;
    segmentIndex?: number;
  },
  style: RepresentationStyle
): void {
  segmentationStyle.setViewportSpecificStyleForSegmentation(specifier, style);
  triggerSegmentationRender(specifier.viewportId);
}

/**
 * Sets the renderInactiveSegmentations flag for a specific viewport.
 * @param viewportId - The ID of the viewport.
 * @param renderInactiveSegmentations - Whether to render inactive segmentations.
 */
function setViewportRenderInactiveSegmentations(
  viewportId: string,
  renderInactiveSegmentations: boolean
): void {
  segmentationStyle.setViewportRenderInactiveSegmentations(
    viewportId,
    renderInactiveSegmentations
  );
  triggerSegmentationRender(viewportId);
}

export {
  getStyle,
  // Global
  getGlobalStyle,
  setGlobalStyle,
  setGlobalLabelmapStyle,
  setGlobalContourStyle,
  setGlobalSurfaceStyle,
  // Segmentation-specific style
  setSegmentationSpecificStyle,
  setLabelmapStyle,
  // Viewport-specific style
  setViewportSpecificStyleForRepresentationType,
  setViewportSpecificStyleForSegmentation,
  // Per-segment style
  // Viewport render inactive segmentations
  setViewportRenderInactiveSegmentations,
};
