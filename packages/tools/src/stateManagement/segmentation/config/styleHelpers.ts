import type SegmentationRepresentations from '../../../enums/SegmentationRepresentations';
import type { ContourStyle } from '../../../types/ContourTypes';
import type { LabelmapStyle } from '../../../types/LabelmapTypes';
import type { SurfaceStyle } from '../../../types/SurfaceTypes';
import { getViewportSegmentations } from '../getViewportSegmentations';
import { triggerSegmentationRender } from '../SegmentationRenderingEngine';
import { segmentationStyle } from '../SegmentationStyle';
import type { RepresentationStyle } from '../SegmentationStyle';
import { triggerSegmentationRepresentationModified } from '../triggerSegmentationEvents';

type BaseSpecifier = {
  viewportId?: string;
  segmentationId?: string;
  segmentIndex?: number;
};

type SpecifierWithType<T extends SegmentationRepresentations> =
  BaseSpecifier & {
    type: T;
  };

type StyleForType<T extends SegmentationRepresentations> =
  T extends SegmentationRepresentations.Labelmap
    ? LabelmapStyle
    : T extends SegmentationRepresentations.Contour
    ? ContourStyle
    : T extends SegmentationRepresentations.Surface
    ? SurfaceStyle
    : never;

/**
 * Get the style for a given segmentation representation.
 * @param specifier The specifier object containing the viewportId, segmentationId, type, and segmentIndex.
 * @returns The style for the given segmentation representation.
 */
function getStyle<T extends SegmentationRepresentations>(
  specifier: SpecifierWithType<T>
): StyleForType<T>;
function getStyle(
  specifier: BaseSpecifier & { type?: SegmentationRepresentations }
): RepresentationStyle {
  return segmentationStyle.getStyle(specifier);
}

/**
 * Set the style for a given segmentation representation.
 * @param specifier The specifier object containing the viewportId, segmentationId, type, and segmentIndex.
 * @param style The style to set for the given segmentation representation.
 */
function setStyle<T extends SegmentationRepresentations>(
  specifier: SpecifierWithType<T>,
  style: StyleForType<T>
): void;
function setStyle(
  specifier: BaseSpecifier & { type: SegmentationRepresentations },
  style: RepresentationStyle
): void {
  segmentationStyle.setStyle(specifier, style);

  triggerSegmentationRepresentationModified(
    specifier.viewportId,
    specifier.segmentationId,
    specifier.type
  );
}

/**
 * Set the renderInactiveSegmentations flag for a specific viewport.
 * @param viewportId The ID of the viewport.
 * @param renderInactiveSegmentations Whether to render inactive segmentations.
 */
function setRenderInactiveSegmentations(
  viewportId: string,
  renderInactiveSegmentations: boolean
): void {
  segmentationStyle.setRenderInactiveSegmentations(
    viewportId,
    renderInactiveSegmentations
  );

  triggerSegmentationRender(viewportId);

  // get all the segmentations for the viewport
  const segmentations = getViewportSegmentations(viewportId);

  segmentations.forEach((segmentation) => {
    triggerSegmentationRepresentationModified(
      viewportId,
      segmentation.segmentationId
    );
  });
}

/**
 * Get the renderInactiveSegmentations flag for a specific viewport.
 * @param viewportId The ID of the viewport.
 * @returns Whether to render inactive segmentations.
 */
function getRenderInactiveSegmentations(viewportId: string): boolean {
  return segmentationStyle.getRenderInactiveSegmentations(viewportId);
}

/**
 * Reset the segmentation style to the global style.
 */
function resetToGlobalStyle(): void {
  segmentationStyle.resetToGlobalStyle();
  triggerSegmentationRender();
}

/**
 * Checks if there is a non-global style for a given specifier.
 * @param specifier - The specifier object containing viewportId, segmentationId, type, and segmentIndex.
 * @returns True if there is a non-global style, false otherwise.
 */
function hasCustomStyle(specifier: {
  viewportId?: string;
  segmentationId?: string;
  type?: SegmentationRepresentations;
  segmentIndex?: number;
}): boolean {
  return segmentationStyle.hasCustomStyle(specifier);
}

export {
  getStyle,
  setStyle,
  setRenderInactiveSegmentations,
  getRenderInactiveSegmentations,
  resetToGlobalStyle,
  hasCustomStyle,
};
