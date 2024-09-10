import type { SegmentationRepresentations } from '../../enums';
import getDefaultContourConfig from '../../tools/displayTools/Contour/contourConfig';
import getDefaultLabelmapConfig from '../../tools/displayTools/Labelmap/labelmapConfig';
import type { ContourStyle } from '../../types/ContourTypes';
import type { LabelmapStyle } from '../../types/LabelmapTypes';
import type { SurfaceStyle } from '../../types/SurfaceTypes';
import * as Enums from '../../enums';

export type RepresentationStyle = {
  style: LabelmapStyle | ContourStyle | SurfaceStyle;
  renderInactiveSegmentations: boolean;
};

interface SegmentationStyleConfig {
  global: {
    [key in SegmentationRepresentations]?: RepresentationStyle;
  };
  segmentations: {
    [segmentationId: string]: {
      [key in SegmentationRepresentations]?: {
        allSegments?: RepresentationStyle;
        perSegment?: { [key: number]: RepresentationStyle };
      };
    };
  };
  viewports: {
    [viewportId: string]: {
      renderInactiveSegmentations: boolean;
      representations: {
        [segmentationId: string]: {
          [key in SegmentationRepresentations]?: {
            allSegments?: RepresentationStyle;
            perSegment?: { [key: number]: RepresentationStyle };
          };
        };
      };
    };
  };
}

/**
 * This class handles the configuration of segmentation styles. It supports
 * three representation types: labelmap, contour, and surface.
 *
 * The hierarchy of the configuration is as follows (each level falls back to the
 * next level if not specified):
 *
 * 1) Viewport-specific styles for a segmentation
 *     2) Segmentation-specific styles (for all viewports)
 *         3) Global styles for a representation type
 *             4) Default styles
 */
class SegmentationStyle {
  private config: SegmentationStyleConfig;

  constructor() {
    this.config = {
      global: {},
      segmentations: {},
      viewports: {},
    };
  }

  /**
   * Sets the global style for a specific representation type.
   * @param representationType - The type of segmentation representation.
   * @param styles - The styles to set globally for the representation type.
   */
  setGlobalStyle(
    representationType: SegmentationRepresentations,
    styles: RepresentationStyle
  ): void {
    this.config.global[representationType] = styles;
  }

  getGlobalStyle(
    representationType: SegmentationRepresentations
  ): RepresentationStyle {
    return this.config.global[representationType];
  }

  /**
   * Sets the style for a specific segmentation.
   * @param specifier - An object containing the specifications for the segmentation style.
   * @param specifier.segmentationId - The ID of the segmentation.
   * @param specifier.representationType - The type of segmentation representation.
   * @param specifier.segmentIndex - Optional. The index of the specific segment to style.
   * @param styles - The styles to set for the segmentation.
   */
  setSegmentationStyle(
    specifier: {
      segmentationId: string;
      representationType: SegmentationRepresentations;
      segmentIndex?: number;
    },
    styles: RepresentationStyle
  ): void {
    const { segmentationId, representationType, segmentIndex } = specifier;

    if (!this.config.segmentations[segmentationId]) {
      this.config.segmentations[segmentationId] = {};
    }
    if (!this.config.segmentations[segmentationId][representationType]) {
      this.config.segmentations[segmentationId][representationType] = {};
    }

    if (segmentIndex !== undefined) {
      if (
        !this.config.segmentations[segmentationId][representationType]
          .perSegment
      ) {
        this.config.segmentations[segmentationId][
          representationType
        ].perSegment = {};
      }
      this.config.segmentations[segmentationId][representationType].perSegment[
        segmentIndex
      ] = styles;
    } else {
      this.config.segmentations[segmentationId][
        representationType
      ].allSegments = styles;
    }
  }

  /**
   * Sets the renderInactiveSegmentations flag for a specific viewport.
   * @param viewportId - The ID of the viewport.
   * @param renderInactiveSegmentations - Whether to render inactive segmentations.
   */
  setViewportRenderInactiveSegmentations(
    viewportId: string,
    renderInactiveSegmentations: boolean
  ): void {
    if (!this.config.viewports[viewportId]) {
      this.config.viewports[viewportId] = {
        renderInactiveSegmentations: false,
        representations: {},
      };
    }
    this.config.viewports[viewportId].renderInactiveSegmentations =
      renderInactiveSegmentations;
  }

  /**
   * Sets the style for a specific segmentation in a specific viewport.
   * @param specifier - An object containing the specifications for the viewport-specific segmentation style.
   * @param specifier.viewportId - The ID of the viewport.
   * @param specifier.segmentationId - The ID of the segmentation.
   * @param specifier.representationType - The type of segmentation representation.
   * @param specifier.segmentIndex - Optional. The index of the specific segment to style.
   * @param styles - The styles to set for the segmentation in the specified viewport.
   */
  setViewportStyle(
    specifier: {
      viewportId: string;
      segmentationId: string;
      representationType: SegmentationRepresentations;
      segmentIndex?: number;
    },
    styles: RepresentationStyle
  ): void {
    const { viewportId, segmentationId, representationType, segmentIndex } =
      specifier;

    if (!this.config.viewports[viewportId]) {
      this.config.viewports[viewportId] = {
        renderInactiveSegmentations: false,
        representations: {},
      };
    }
    if (!this.config.viewports[viewportId].representations[segmentationId]) {
      this.config.viewports[viewportId].representations[segmentationId] = {};
    }
    if (
      !this.config.viewports[viewportId].representations[segmentationId][
        representationType
      ]
    ) {
      this.config.viewports[viewportId].representations[segmentationId][
        representationType
      ] = {};
    }

    if (segmentIndex !== undefined) {
      if (
        !this.config.viewports[viewportId].representations[segmentationId][
          representationType
        ].perSegment
      ) {
        this.config.viewports[viewportId].representations[segmentationId][
          representationType
        ].perSegment = {};
      }
      this.config.viewports[viewportId].representations[segmentationId][
        representationType
      ].perSegment[segmentIndex] = styles;
    } else {
      this.config.viewports[viewportId].representations[segmentationId][
        representationType
      ].allSegments = styles;
    }
  }

  /**
   * Gets the style for a segmentation based on the provided specifications.
   * @param specifier - An object containing the specifications for the segmentation style.
   * @param specifier.viewportId - The ID of the viewport.
   * @param specifier.segmentationId - The ID of the segmentation.
   * @param specifier.representationType - The type of segmentation representation.
   * @param specifier.segmentIndex - Optional. The index of the specific segment.
   * @returns An object containing the combined style and renderInactiveSegmentations flag for the viewport.
   */
  getSegmentationStyle(specifier: {
    viewportId?: string;
    segmentationId?: string;
    representationType?: SegmentationRepresentations;
    segmentIndex?: number;
  }): { style: RepresentationStyle; renderInactiveSegmentations: boolean } {
    const { viewportId, segmentationId, representationType, segmentIndex } =
      specifier;

    let combinedStyle = this.getDefaultStyle(representationType);
    let renderInactiveSegmentations = false;

    // Apply global styles for the representation type
    if (this.config.global[representationType]) {
      combinedStyle = {
        ...combinedStyle,
        ...this.config.global[representationType],
      };
    }

    // Apply segmentation-specific styles
    if (this.config.segmentations[segmentationId]?.[representationType]) {
      combinedStyle = {
        ...combinedStyle,
        ...this.config.segmentations[segmentationId][representationType]
          .allSegments,
      };
      if (
        segmentIndex !== undefined &&
        this.config.segmentations[segmentationId][representationType]
          .perSegment?.[segmentIndex]
      ) {
        combinedStyle = {
          ...combinedStyle,
          ...this.config.segmentations[segmentationId][representationType]
            .perSegment[segmentIndex],
        };
      }
    }

    // Apply viewport-specific styles and get renderInactiveSegmentations
    if (viewportId && this.config.viewports[viewportId]) {
      renderInactiveSegmentations =
        this.config.viewports[viewportId].renderInactiveSegmentations;

      if (
        segmentationId &&
        this.config.viewports[viewportId].representations[segmentationId]?.[
          representationType
        ]
      ) {
        combinedStyle = {
          ...combinedStyle,
          ...this.config.viewports[viewportId].representations[segmentationId][
            representationType
          ].allSegments,
        };
        if (
          segmentIndex !== undefined &&
          this.config.viewports[viewportId].representations[segmentationId][
            representationType
          ].perSegment?.[segmentIndex]
        ) {
          combinedStyle = {
            ...combinedStyle,
            ...this.config.viewports[viewportId].representations[
              segmentationId
            ][representationType].perSegment[segmentIndex],
          };
        }
      }
    }

    return { style: combinedStyle, renderInactiveSegmentations };
  }

  /**
   * Gets the default style for a specific representation type.
   * @param representationType - The type of segmentation representation.
   * @returns The default style for the specified representation type.
   */
  private getDefaultStyle(
    representationType: SegmentationRepresentations
  ): RepresentationStyle {
    switch (representationType) {
      case Enums.SegmentationRepresentations.Labelmap:
        return getDefaultLabelmapConfig();
      case Enums.SegmentationRepresentations.Contour:
        return getDefaultContourConfig();
      case Enums.SegmentationRepresentations.Surface:
        return {}; // TODO: Implement default surface config when available
      default:
        throw new Error(`Unknown representation type: ${representationType}`);
    }
  }
}

const segmentationStyle = new SegmentationStyle();

export { segmentationStyle };
