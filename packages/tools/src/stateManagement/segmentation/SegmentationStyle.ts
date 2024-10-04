import type { SegmentationRepresentations } from '../../enums';
import getDefaultContourConfig from '../../tools/displayTools/Contour/contourConfig';
import getDefaultLabelmapConfig from '../../tools/displayTools/Labelmap/labelmapConfig';
import type { BaseContourStyle, ContourStyle } from '../../types/ContourTypes';
import type {
  BaseLabelmapStyle,
  LabelmapStyle,
} from '../../types/LabelmapTypes';
import type { SurfaceStyle } from '../../types/SurfaceTypes';
import * as Enums from '../../enums';
import { utilities } from '@cornerstonejs/core';

export type RepresentationStyle = LabelmapStyle | ContourStyle | SurfaceStyle;

export type BaseRepresentationStyle = BaseLabelmapStyle | BaseContourStyle;

interface SegmentationStyleConfig {
  global: {
    [key in SegmentationRepresentations]?: RepresentationStyle;
  };
  // per segmentation we follow the same active and inactive style properties
  // since the target (segmentation) is important not the activeness etc
  segmentations: {
    [segmentationId: string]: {
      [key in SegmentationRepresentations]?: {
        allSegments?: BaseRepresentationStyle;
        perSegment?: { [key: number]: BaseRepresentationStyle };
      };
    };
  };
  viewportsStyle: {
    [viewportId: string]: {
      renderInactiveSegmentations: boolean;
      representations: {
        [segmentationId: string]: {
          [key in SegmentationRepresentations]?: {
            allSegments?: BaseRepresentationStyle;
            perSegment?: {
              [key: number]: BaseRepresentationStyle;
            };
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
 * 1) Viewport-specific styles for a specific segmentationId and representation type (viewport 1 & segmentation 1 (contour))
 * 2) Viewport-specific styles for all of the segmentations of a specific representation type (viewport 1 & segmentation 1 (labelmap) || viewport 1 & segmentation 2 (labelmap) etc etc)
 * 3) Segmentation-specific styles (for all viewports) (segmentation 1 (labelmap) for all viewports)
 * 4) Global styles for a representation type (all viewports & all segmentations & labelmap)
 * 5) Default styles
 */
class SegmentationStyle {
  private config: SegmentationStyleConfig;

  constructor() {
    this.config = {
      global: {},
      segmentations: {},
      viewportsStyle: {},
    };
  }

  /**
   * Sets the style based on the provided specifiers.
   * The priority hierarchy is as follows:
   * 1) Viewport-specific styles for a specific segmentation and representation type
   * 2) Viewport-specific styles for all segmentations of a representation type
   * 3) Segmentation-specific styles for a representation type
   * 4) Global styles for a representation type
   * 5) Default styles
   * @param specifier - An object containing the specifications for the style.
   * @param specifier.type - The type of segmentation representation (required).
   * @param specifier.viewportId - Optional. The ID of the viewport.
   * @param specifier.segmentationId - Optional. The ID of the segmentation.
   * @param specifier.segmentIndex - Optional. The index of the specific segment to style.
   * @param styles - The styles to set.
   */
  setStyle(
    specifier: {
      type: SegmentationRepresentations;
      viewportId?: string;
      segmentationId?: string;
      segmentIndex?: number;
    },
    styles: RepresentationStyle
  ): void {
    const { viewportId, segmentationId, type, segmentIndex } = specifier;

    const currentStyles = this.getStyle(specifier);

    let updatedStyles: RepresentationStyle;

    if (!viewportId && !segmentationId) {
      // Global style setting
      updatedStyles = {
        ...currentStyles,
        ...styles,
      };
    } else {
      // Per segmentation or per viewport style setting
      updatedStyles = this.copyActiveToInactiveIfNotProvided(
        {
          ...currentStyles,
          ...styles,
        },
        type
      );
    }

    if (!type) {
      throw new Error('Type is required to set a style');
    }

    if (viewportId) {
      // Viewport-specific styles
      if (!this.config.viewportsStyle[viewportId]) {
        this.config.viewportsStyle[viewportId] = {
          renderInactiveSegmentations: false,
          representations: {},
        };
      }

      const representations =
        this.config.viewportsStyle[viewportId].representations;

      if (segmentationId) {
        // Viewport-specific style for a specific segmentation
        if (!representations[segmentationId]) {
          representations[segmentationId] = {};
        }
        if (!representations[segmentationId][type]) {
          representations[segmentationId][type] = {};
        }

        const repConfig = representations[segmentationId][type];

        if (segmentIndex !== undefined) {
          // Style for a specific segment
          if (!repConfig.perSegment) {
            repConfig.perSegment = {};
          }
          repConfig.perSegment[segmentIndex] = updatedStyles;
        } else {
          // Style for all segments of the segmentation
          repConfig.allSegments = updatedStyles;
        }
      } else {
        // Viewport-specific style for all segmentations of a type
        const ALL_SEGMENTATIONS_KEY = '__allSegmentations__';
        if (!representations[ALL_SEGMENTATIONS_KEY]) {
          representations[ALL_SEGMENTATIONS_KEY] = {};
        }
        if (!representations[ALL_SEGMENTATIONS_KEY][type]) {
          representations[ALL_SEGMENTATIONS_KEY][type] = {};
        }

        representations[ALL_SEGMENTATIONS_KEY][type].allSegments =
          updatedStyles;
      }
    } else if (segmentationId) {
      // Segmentation-specific updatedStyles
      if (!this.config.segmentations[segmentationId]) {
        this.config.segmentations[segmentationId] = {};
      }
      if (!this.config.segmentations[segmentationId][type]) {
        this.config.segmentations[segmentationId][type] = {};
      }

      const segConfig = this.config.segmentations[segmentationId][type];

      if (segmentIndex !== undefined) {
        // Style for a specific segment
        if (!segConfig.perSegment) {
          segConfig.perSegment = {};
        }
        segConfig.perSegment[segmentIndex] = updatedStyles;
      } else {
        // Style for all segments of the segmentation
        segConfig.allSegments = updatedStyles;
      }
    } else {
      // Global style for the representation type
      this.config.global[type] = updatedStyles;
    }
  }

  /**
   * Copies active style properties to their inactive counterparts if not provided.
   * @param styles - The styles to process.
   * @param type - The type of segmentation representation.
   * @returns The processed styles with inactive properties set if not provided.
   */
  private copyActiveToInactiveIfNotProvided(
    styles: RepresentationStyle,
    type: SegmentationRepresentations
  ): RepresentationStyle {
    const processedStyles = { ...styles };

    if (type === Enums.SegmentationRepresentations.Labelmap) {
      const labelmapStyles = processedStyles as LabelmapStyle;

      labelmapStyles.renderOutlineInactive = labelmapStyles.renderOutline;
      labelmapStyles.outlineWidthInactive = labelmapStyles.outlineWidth;
      labelmapStyles.renderFillInactive = labelmapStyles.renderFill;
      labelmapStyles.fillAlphaInactive = labelmapStyles.fillAlpha;
      labelmapStyles.outlineOpacityInactive = labelmapStyles.outlineOpacity;
    } else if (type === Enums.SegmentationRepresentations.Contour) {
      const contourStyles = processedStyles as ContourStyle;

      contourStyles.outlineWidthInactive = contourStyles.outlineWidth;
      contourStyles.outlineOpacityInactive = contourStyles.outlineOpacity;
      contourStyles.outlineDashInactive = contourStyles.outlineDash;
      contourStyles.renderOutlineInactive = contourStyles.renderOutline;
      contourStyles.renderFillInactive = contourStyles.renderFill;
      contourStyles.fillAlphaInactive = contourStyles.fillAlpha;
    }

    return processedStyles;
  }

  /**
   * Gets the style for a segmentation based on the provided specifications.
   * @param specifier - An object containing the specifications for the segmentation style.
   * @param specifier.viewportId - The ID of the viewport.
   * @param specifier.segmentationId - The ID of the segmentation.
   * @param specifier.type - The type of segmentation representation.
   * @param specifier.segmentIndex - Optional. The index of the specific segment.
   * @returns An object containing the combined style and renderInactiveSegmentations flag for the viewport.
   */
  getStyle(specifier: {
    viewportId?: string;
    segmentationId?: string;
    type?: SegmentationRepresentations;
    segmentIndex?: number;
  }): RepresentationStyle {
    const { viewportId, segmentationId, type, segmentIndex } = specifier;
    let combinedStyle = this.getDefaultStyle(type);
    let renderInactiveSegmentations = false;

    // Apply global styles for the representation type
    if (this.config.global[type]) {
      combinedStyle = {
        ...combinedStyle,
        ...this.config.global[type],
      };
    }

    // Apply segmentation-specific styles
    if (this.config.segmentations[segmentationId]?.[type]) {
      combinedStyle = {
        ...combinedStyle,
        ...this.config.segmentations[segmentationId][type].allSegments,
      };
      if (
        segmentIndex !== undefined &&
        this.config.segmentations[segmentationId][type].perSegment?.[
          segmentIndex
        ]
      ) {
        combinedStyle = {
          ...combinedStyle,
          ...this.config.segmentations[segmentationId][type].perSegment[
            segmentIndex
          ],
        };
      }
    }

    // Apply viewport-specific styles and get renderInactiveSegmentations
    if (viewportId && this.config.viewportsStyle[viewportId]) {
      renderInactiveSegmentations =
        this.config.viewportsStyle[viewportId].renderInactiveSegmentations;

      // Apply viewport-specific styles for all segmentations of this representation type
      const allSegmentationsKey = '__allSegmentations__';
      if (
        this.config.viewportsStyle[viewportId].representations[
          allSegmentationsKey
        ]?.[type]
      ) {
        combinedStyle = {
          ...combinedStyle,
          ...this.config.viewportsStyle[viewportId].representations[
            allSegmentationsKey
          ][type].allSegments,
        };
      }

      // Apply viewport-specific styles for this specific segmentation
      if (
        segmentationId &&
        this.config.viewportsStyle[viewportId].representations[
          segmentationId
        ]?.[type]
      ) {
        combinedStyle = {
          ...combinedStyle,
          ...this.config.viewportsStyle[viewportId].representations[
            segmentationId
          ][type].allSegments,
        };
        if (
          segmentIndex !== undefined &&
          this.config.viewportsStyle[viewportId].representations[
            segmentationId
          ][type].perSegment?.[segmentIndex]
        ) {
          combinedStyle = {
            ...combinedStyle,
            ...this.config.viewportsStyle[viewportId].representations[
              segmentationId
            ][type].perSegment[segmentIndex],
          };
        }
      }
    }

    return combinedStyle;
  }

  /**
   * Retrieves the renderInactiveSegmentations flag for a specific viewport.
   *
   * @param viewportId - The ID of the viewport to check.
   * @returns A boolean indicating whether inactive segmentations should be rendered for the specified viewport.
   */
  getRenderInactiveSegmentations(viewportId: string): boolean {
    return this.config.viewportsStyle[viewportId]?.renderInactiveSegmentations;
  }

  /**
   * Sets the renderInactiveSegmentations flag for a specific viewport.
   * @param viewportId - The ID of the viewport.
   * @param renderInactiveSegmentations - Whether to render inactive segmentations.
   */
  setRenderInactiveSegmentations(
    viewportId: string,
    renderInactiveSegmentations: boolean
  ): void {
    if (!this.config.viewportsStyle[viewportId]) {
      this.config.viewportsStyle[viewportId] = {
        renderInactiveSegmentations: false,
        representations: {},
      };
    }
    this.config.viewportsStyle[viewportId].renderInactiveSegmentations =
      renderInactiveSegmentations;
  }

  /**
   * Gets the default style for a specific representation type.
   * @param type - The type of segmentation representation.
   * @returns The default style for the specified representation type.
   */
  private getDefaultStyle(
    type: SegmentationRepresentations
  ): RepresentationStyle {
    switch (type) {
      case Enums.SegmentationRepresentations.Labelmap:
        return getDefaultLabelmapConfig();
      case Enums.SegmentationRepresentations.Contour:
        return getDefaultContourConfig();
      case Enums.SegmentationRepresentations.Surface:
        return {}; // TODO: Implement default surface config when available
      default:
        throw new Error(`Unknown representation type: ${type}`);
    }
  }

  /**
   * Clears the segmentation-specific style for a given segmentation ID.
   * @param segmentationId - The ID of the segmentation to clear.
   */
  clearSegmentationStyle(segmentationId: string): void {
    if (this.config.segmentations[segmentationId]) {
      delete this.config.segmentations[segmentationId];
    }
  }

  /**
   * Clears all segmentation-specific styles.
   */
  clearAllSegmentationStyles(): void {
    this.config.segmentations = {};
  }

  /**
   * Clears the viewport-specific style for a given viewport ID.
   * @param viewportId - The ID of the viewport to clear.
   */
  clearViewportStyle(viewportId: string): void {
    if (this.config.viewportsStyle[viewportId]) {
      delete this.config.viewportsStyle[viewportId];
    }
  }

  /**
   * Clears all viewport-specific representation styles while preserving the renderInactiveSegmentations setting.
   */
  clearAllViewportStyles(): void {
    for (const viewportId in this.config.viewportsStyle) {
      const viewportStyle = this.config.viewportsStyle[viewportId];
      const renderInactiveSegmentations =
        viewportStyle.renderInactiveSegmentations;
      this.config.viewportsStyle[viewportId] = {
        renderInactiveSegmentations,
        representations: {},
      };
    }
  }

  /**
   * Clears both segmentation-specific and viewport-specific styles,
   * effectively resetting to global styles.
   */
  resetToGlobalStyle(): void {
    this.clearAllSegmentationStyles();
    this.clearAllViewportStyles();
  }

  /**
   * Checks if there is a non-global style for a given specifier.
   * @param specifier - The specifier object containing viewportId, segmentationId, type, and segmentIndex.
   * @returns True if there is a non-global style, false otherwise.
   */
  hasCustomStyle(specifier: {
    viewportId?: string;
    segmentationId?: string;
    type?: SegmentationRepresentations;
    segmentIndex?: number;
  }): boolean {
    const { type } = specifier;
    const style = this.getStyle(specifier);
    // Perform a deep comparison between the style and the default style
    const defaultStyle = this.getDefaultStyle(type);
    return !utilities.deepEqual(style, defaultStyle);
  }
}

const segmentationStyle = new SegmentationStyle();

export { segmentationStyle };
