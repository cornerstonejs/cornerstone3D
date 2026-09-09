import type { Types } from '@cornerstonejs/core';
import AnnotationDisplayTool from './base/AnnotationDisplayTool';
import { drawTextBox, drawRectByCoordinates } from '../drawingSvg';
import type { PublicToolProps, ToolProps, SVGDrawingHelper } from '../types';
import type { StyleSpecifier } from '../types/AnnotationStyle';
import { getToolGroup } from '../store/ToolGroupManager';

// --- Types -----------------------------------------------------------------

interface WaveformChannel {
  name: string;
  visible?: boolean;
}

interface TraceRegion {
  id?: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  leadIndices: number[];
  timeWindow?: [number, number];
}

interface DisplaySetPresentation {
  traceRegions?: TraceRegion[];
  visibleChannels?: number[];
}

interface WaveformData {
  numberOfSamples?: number;
  samplingFrequency?: number;
  channels?: WaveformChannel[];
}

interface WaveformViewportLike {
  getWaveformData?: () => WaveformData | undefined;
  getDisplaySetPresentation?: (
    dataId?: string
  ) => DisplaySetPresentation | undefined;
  getCurrentImageId?: () => string | undefined;
  getVisibleChannels?: () => WaveformChannel[];
  worldToCanvas?: (point: Types.Point3) => Types.Point2;
  getContentDimensions?: () => { width: number; height: number };
}

interface OverlayStyles {
  showLabels: boolean;
  showBoxes: boolean;
  fontSize: string;
  color: string;
  background: string;
  boxColor: string;
  boxLineWidth: string;
}

// --- Constants ---------------------------------------------------------------
// Centralized so label/box positioning tweaks don't require hunting through
// render logic, and so the defaults are visible in one place for review.

const DEFAULT_STYLES: Omit<OverlayStyles, 'showLabels' | 'showBoxes'> = {
  fontSize: '11px',
  color: 'rgb(255, 255, 0)',
  background: 'rgba(0, 0, 0, 0.75)',
  boxColor: 'rgba(255, 255, 255, 0.2)',
  boxLineWidth: '1',
};

const LABEL_OFFSET_X = 6;
const LABEL_OFFSET_Y = 2;
const LABEL_MIN_X = 6;
const LABEL_MIN_Y = 2;
const FALLBACK_TOTAL_SAMPLES = 5000;
const FALLBACK_CONTENT_DIMENSIONS = { width: 1500, height: 1000 };

/**
 * @public
 * @class WaveformRegionOverlayTool
 * @memberof Tools
 *
 * @classdesc Tool for displaying lead name badges ("I", "II", "aVR", "V1"-"V6") and
 * region bounding frames on waveform/ECG viewports based on active traceRegions
 * or channel metadata.
 *
 * Rendering takes one of two paths depending on the current presentation:
 * - Segmented layouts (6x2, 3x4, 3x4+1, or any layout with configured
 *   traceRegions): each region gets its own label/box, positioned from its
 *   normalized bounds.
 * - Continuous stacked layouts (12x1, or any presentation with no
 *   traceRegions): each channel gets a single label at its row.
 *
 * @extends Tools.Base.AnnotationDisplayTool
 */
class WaveformRegionOverlayTool extends AnnotationDisplayTool {
  static toolName;

  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      configuration: {
        showLabels: true,
        showBoxes: false,
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }

  renderAnnotation = (
    enabledElement: Types.IEnabledElement,
    svgDrawingHelper: SVGDrawingHelper
  ): boolean => {
    const { viewport } = enabledElement;
    if (!viewport?.canvas) {
      return false;
    }

    const waveformViewport = viewport as unknown as WaveformViewportLike;
    const waveform = waveformViewport.getWaveformData?.();
    if (!waveform?.channels?.length) {
      return false;
    }

    const canvasWidth = viewport.canvas.clientWidth || viewport.canvas.width;
    const canvasHeight = viewport.canvas.clientHeight || viewport.canvas.height;
    if (!canvasWidth || !canvasHeight) {
      return false;
    }

    const currentImageId = waveformViewport.getCurrentImageId?.();
    const presentation =
      waveformViewport.getDisplaySetPresentation?.(currentImageId) ?? {};
    const { traceRegions, visibleChannels } = presentation;

    const styles = this._getStyles(viewport);
    const annotationUID = `${this.getToolName()}-${viewport.id}`;

    return traceRegions?.length
      ? this._renderTraceRegions(svgDrawingHelper, {
          waveformViewport,
          waveform,
          traceRegions,
          visibleChannels,
          styles,
          annotationUID,
          canvasWidth,
          canvasHeight,
        })
      : this._renderStackedChannels(svgDrawingHelper, {
          waveformViewport,
          waveform,
          styles,
          annotationUID,
          canvasWidth,
          canvasHeight,
        });
  };

  /**
   * Resolves a single style value through Cornerstone's cascading toolStyle
   * hierarchy, falling back to the tool's own configuration, then to a
   * supplied default. Centralizing this avoids repeating the
   * getStyle(...) ?? configuration.x ?? default chain per field.
   */
  private _resolveStyle<T>(
    key: string,
    styleSpecifier: StyleSpecifier,
    configValue: T | undefined,
    defaultValue: T
  ): T {
    const fromToolStyle = this.getStyle(key, styleSpecifier) as T | undefined;
    return fromToolStyle ?? configValue ?? defaultValue;
  }

  /**
   * Retrieves and resolves styling properties (colors, fonts, box outlines)
   * for the given viewport using Cornerstone's cascading tool style hierarchy.
   */
  private _getStyles(viewport: Types.IViewport): OverlayStyles {
    const toolGroup = getToolGroup(viewport.id);
    const styleSpecifier: StyleSpecifier = {
      viewportId: viewport.id,
      toolGroupId: toolGroup?.id,
      toolName: this.getToolName(),
    };
    const config = this.configuration as Partial<OverlayStyles>;

    return {
      showLabels: this._resolveStyle(
        'showLabels',
        styleSpecifier,
        config.showLabels,
        true
      ),
      showBoxes: this._resolveStyle(
        'showBoxes',
        styleSpecifier,
        config.showBoxes,
        false
      ),
      fontSize: this._resolveStyle(
        'textBoxFontSize',
        styleSpecifier,
        this.getStyle('fontSize', styleSpecifier) as string | undefined,
        DEFAULT_STYLES.fontSize
      ),
      color: this._resolveStyle(
        'textBoxColor',
        styleSpecifier,
        this.getStyle('color', styleSpecifier) as string | undefined,
        DEFAULT_STYLES.color
      ),
      background: this._resolveStyle(
        'textBoxBackground',
        styleSpecifier,
        undefined,
        DEFAULT_STYLES.background
      ),
      boxColor: this._resolveStyle(
        'boxColor',
        styleSpecifier,
        undefined,
        DEFAULT_STYLES.boxColor
      ),
      boxLineWidth: this._resolveStyle(
        'lineWidth',
        styleSpecifier,
        undefined,
        DEFAULT_STYLES.boxLineWidth
      ),
    };
  }

  /**
   * Renders bounding frames and labels for segmented layouts (6x2, 3x4,
   * 3x4+1, etc.) using each region's normalized [0..1] bounds.
   */
  private _renderTraceRegions(
    svgDrawingHelper: SVGDrawingHelper,
    context: {
      waveformViewport: WaveformViewportLike;
      waveform: WaveformData;
      traceRegions: TraceRegion[];
      visibleChannels?: number[];
      styles: OverlayStyles;
      annotationUID: string;
      canvasWidth: number;
      canvasHeight: number;
    }
  ): boolean {
    const {
      waveformViewport,
      waveform,
      traceRegions,
      visibleChannels,
      styles,
      annotationUID,
      canvasWidth,
      canvasHeight,
    } = context;

    if (!styles.showLabels && !styles.showBoxes) {
      return false;
    }

    const visibleSet = visibleChannels ? new Set(visibleChannels) : null;
    const totalSamples = waveform.numberOfSamples || FALLBACK_TOTAL_SAMPLES;

    const { xOffset, yOffset, stripWidth, stripHeight } =
      this._computeStripTransform(
        waveformViewport,
        waveform,
        totalSamples,
        canvasWidth,
        canvasHeight,
        traceRegions,
        visibleSet
      );

    traceRegions.forEach((region, index) => {
      if (visibleSet && !this._regionHasVisibleChannel(region, visibleSet)) {
        return;
      }

      const { x0, x1, y0, y1 } = this._regionToCanvasRect(
        region,
        xOffset,
        yOffset,
        stripWidth,
        stripHeight
      );

      if (styles.showBoxes) {
        drawRectByCoordinates(
          svgDrawingHelper,
          annotationUID,
          `box-${index}`,
          [
            [x0, y0],
            [x1, y0],
            [x0, y1],
            [x1, y1],
          ],
          { color: styles.boxColor, lineWidth: styles.boxLineWidth }
        );
      }

      if (styles.showLabels) {
        const leadName = this._resolveRegionLabel(region, waveform, index);
        drawTextBox(
          svgDrawingHelper,
          annotationUID,
          `label-${index}`,
          [leadName],
          [
            Math.max(LABEL_MIN_X, x0 + LABEL_OFFSET_X),
            Math.max(LABEL_MIN_Y, y0 + LABEL_OFFSET_Y),
          ],
          {
            fontSize: styles.fontSize,
            color: styles.color,
            background: styles.background,
            fontFamily: 'monospace',
            padding: 2,
          }
        );
      }
    });

    return true;
  }

  /** True if any of a region's leads are in the visible-channel set. */
  private _regionHasVisibleChannel(
    region: TraceRegion,
    visibleSet: Set<number>
  ): boolean {
    return (
      !region.leadIndices ||
      region.leadIndices.some((idx) => visibleSet.has(idx))
    );
  }

  /** Resolves a region's display label: explicit id, joined lead names, or a positional fallback. */
  private _resolveRegionLabel(
    region: TraceRegion,
    waveform: WaveformData,
    index: number
  ): string {
    if (region.id) {
      return region.id;
    }
    const names = region.leadIndices
      ?.map((i) => waveform.channels?.[i]?.name)
      .filter(Boolean);
    return names?.length ? names.join(', ') : `${index + 1}`;
  }

  /**
   * Computes the canvas-space transform (offset + scale) shared by every
   * region this frame, derived from the first visible region's world-to-canvas
   * projection. Regions are then positioned relative to this shared strip.
   */
  private _computeStripTransform(
    waveformViewport: WaveformViewportLike,
    waveform: WaveformData,
    totalSamples: number,
    canvasWidth: number,
    canvasHeight: number,
    traceRegions: TraceRegion[],
    visibleSet: Set<number> | null
  ) {
    const contentDims =
      waveformViewport.getContentDimensions?.() ?? FALLBACK_CONTENT_DIMENSIONS;

    const durationMs =
      waveform.samplingFrequency && waveform.numberOfSamples
        ? (waveform.numberOfSamples / waveform.samplingFrequency) * 1000
        : 10000;
    const samplingFreq =
      waveform.samplingFrequency ?? totalSamples / (durationMs / 1000);

    for (let rIdx = 0; rIdx < traceRegions.length; rIdx++) {
      const region = traceRegions[rIdx];
      if (visibleSet && !this._regionHasVisibleChannel(region, visibleSet)) {
        continue;
      }

      const visibleLead =
        region.leadIndices?.find((idx) => !visibleSet || visibleSet.has(idx)) ??
        region.leadIndices?.[0] ??
        rIdx;

      const z = rIdx * 1000 + visibleLead;
      const minX = region.bounds?.minX ?? 0;
      const maxX = region.bounds?.maxX ?? 1;
      const spanX = Math.max(1e-4, maxX - minX);

      const regionStartMs = region.timeWindow?.[0] ?? minX * durationMs;
      const regionEndMs = region.timeWindow?.[1] ?? maxX * durationMs;
      const startSample = Math.round((regionStartMs / 1000) * samplingFreq);
      const endSample = Math.round((regionEndMs / 1000) * samplingFreq);

      const ptStart = waveformViewport.worldToCanvas?.([startSample, 0, z]);
      const ptEnd = waveformViewport.worldToCanvas?.([endSample, 0, z]);

      if (
        ptStart &&
        ptEnd &&
        !isNaN(ptStart[0]) &&
        !isNaN(ptStart[1]) &&
        !isNaN(ptEnd[0])
      ) {
        const regionCanvasWidth = ptEnd[0] - ptStart[0];
        const stripWidth = Math.max(1, regionCanvasWidth / spanX);
        const xOffset = ptStart[0] - minX * stripWidth;

        const effectiveRatio = stripWidth / Math.max(1, contentDims.width);
        const stripHeight = contentDims.height * effectiveRatio;

        const leadCount = region.leadIndices?.length || 1;
        const totalMinY = region.bounds?.minY ?? 0;
        const totalMaxY = region.bounds?.maxY ?? 1;
        const slotHeight = (totalMaxY - totalMinY) / leadCount;
        const leadSlotIdx = Math.max(
          0,
          region.leadIndices?.indexOf(visibleLead) ?? 0
        );
        const leadMinY = totalMinY + leadSlotIdx * slotHeight;
        const leadMaxY = leadMinY + slotHeight;
        const leadMidY = (leadMinY + leadMaxY) / 2;

        const yOffset = ptStart[1] - leadMidY * stripHeight;

        return {
          xOffset,
          yOffset,
          stripWidth,
          stripHeight,
        };
      }
    }

    return {
      xOffset: 0,
      yOffset: 0,
      stripWidth: canvasWidth,
      stripHeight: canvasHeight,
    };
  }

  /** Converts a region's normalized [0..1] bounds into canvas-space rect coordinates. */
  private _regionToCanvasRect(
    region: TraceRegion,
    xOffset: number,
    yOffset: number,
    stripWidth: number,
    stripHeight: number
  ) {
    const { minX = 0, maxX = 1, minY = 0, maxY = 1 } = region.bounds ?? {};
    return {
      x0: minX * stripWidth + xOffset,
      x1: maxX * stripWidth + xOffset,
      y0: minY * stripHeight + yOffset,
      y1: maxY * stripHeight + yOffset,
    };
  }

  /**
   * Renders one label per channel for continuous stacked layouts (12x1) —
   * used only when the presentation has no traceRegions.
   */
  private _renderStackedChannels(
    svgDrawingHelper: SVGDrawingHelper,
    context: {
      waveformViewport: WaveformViewportLike;
      waveform: WaveformData;
      styles: OverlayStyles;
      annotationUID: string;
      canvasWidth: number;
      canvasHeight: number;
    }
  ): boolean {
    const {
      waveformViewport,
      waveform,
      styles,
      annotationUID,
      canvasWidth,
      canvasHeight,
    } = context;

    if (!styles.showLabels && !styles.showBoxes) {
      return false;
    }

    const allChannels: WaveformChannel[] =
      waveformViewport.getVisibleChannels?.() ??
      (waveform.channels ?? []).map((c) => ({ name: c.name, visible: true }));

    const activeChannels = allChannels.filter((c) => c.visible !== false);
    if (activeChannels.length === 0) {
      return false;
    }

    const rowHeight = canvasHeight / activeChannels.length;

    allChannels.forEach((channel, channelIndex) => {
      if (channel.visible === false) {
        return;
      }

      const canvasPos = waveformViewport.worldToCanvas?.([0, 0, channelIndex]);

      if (!canvasPos || isNaN(canvasPos[0]) || isNaN(canvasPos[1])) {
        return;
      }

      const topY = canvasPos[1] - rowHeight / 2;

      if (styles.showBoxes) {
        drawRectByCoordinates(
          svgDrawingHelper,
          annotationUID,
          `box-channel-${channel.name}-${channelIndex}`,
          [
            [canvasPos[0], topY],
            [canvasWidth, topY],
            [canvasPos[0], topY + rowHeight],
            [canvasWidth, topY + rowHeight],
          ],
          { color: styles.boxColor, lineWidth: styles.boxLineWidth }
        );
      }

      if (styles.showLabels) {
        drawTextBox(
          svgDrawingHelper,
          annotationUID,
          `channel-${channel.name}-${channelIndex}`,
          [channel.name],
          [
            Math.max(LABEL_MIN_X, canvasPos[0] + LABEL_OFFSET_X),
            Math.max(LABEL_MIN_Y, topY + LABEL_OFFSET_Y),
          ],
          {
            fontSize: styles.fontSize,
            color: styles.color,
            background: styles.background,
            fontFamily: 'monospace',
            padding: 2,
          }
        );
      }
    });

    return true;
  }
}

WaveformRegionOverlayTool.toolName = 'WaveformRegionOverlay';
export default WaveformRegionOverlayTool;
