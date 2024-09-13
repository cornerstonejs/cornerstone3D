import SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import type { ContourStyle } from '../../../types/ContourTypes';
import type { LabelmapStyle } from '../../../types/LabelmapTypes';
import type { SurfaceStyle } from '../../../types/SurfaceTypes';
import {
  triggerSegmentationRender,
  triggerSegmentationRenderBySegmentationId,
} from '../SegmentationRenderingEngine';
import { segmentationStyle } from '../SegmentationStyle';
import type { RepresentationStyle } from '../SegmentationStyle';

/**
 * Get the style for a given segmentation representation.
 * @param specifier The specifier object containing the viewportId, segmentationId, type, and segmentIndex.
 * @returns The style for the given segmentation representation.
 */
function getStyle(specifier: {
  viewportId?: string;
  segmentationId?: string;
  type?: SegmentationRepresentations;
  segmentIndex?: number;
}): { style: RepresentationStyle; renderInactiveSegmentations: boolean } {
  return segmentationStyle.getStyle(specifier);
}

/**
 * Get the global segmentation style for a specific representation type.
 * @param type - The type of segmentation representation.
 * @returns The global segmentation style for the specified representation type.
 */
function getGlobalStyle(
  type: SegmentationRepresentations
): RepresentationStyle {
  return segmentationStyle.getGlobalStyle(type);
}

/**
 * Set the global segmentation style for a specific representation type.
 * @param type - The type of segmentation representation.
 * @param style - The style to be set globally.
 */
function setGlobalStyle(
  type: SegmentationRepresentations,
  style: RepresentationStyle
): void {
  segmentationStyle.setGlobalStyle(type, style);
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
    type: SegmentationRepresentations;
    segmentIndex?: number;
  },
  style: RepresentationStyle
): void {
  segmentationStyle.setSegmentationSpecificStyle(specifier, style);
  triggerSegmentationRenderBySegmentationId(specifier.segmentationId);
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
      type: SegmentationRepresentations.Labelmap,
    },
    style
  );
}

/**
 * Sets the style for all segmentations of a specific representation type in a viewport.
 * @param specifier - An object containing the specifications for the viewport-specific style.
 * @param style - The style to be set for the representation type in the specified viewport.
 */
function setViewportSpecificStyleForType(
  specifier: {
    viewportId: string;
    type: SegmentationRepresentations;
  },
  style: RepresentationStyle
): void {
  segmentationStyle.setViewportSpecificStyleForType(specifier, style);
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
    type: SegmentationRepresentations;
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
  setViewportSpecificStyleForType,
  setViewportSpecificStyleForSegmentation,
  // Per-segment style
  // Viewport render inactive segmentations
  setViewportRenderInactiveSegmentations,
};
