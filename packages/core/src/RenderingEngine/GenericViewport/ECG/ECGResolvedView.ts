import type { ICamera, Point2, Point3 } from '../../../types';
import {
  computeECGChannelLayouts,
  computeECGRegionSampleRange,
  computeECGTimeWindow,
  getVisibleECGChannels,
} from '../../../utilities/ECGUtilities';
import ResolvedViewportView from '../ResolvedViewportView';
import {
  getAnchorWorldForCanvasPoint,
  getAnchorWorldForPan,
  resolveECGCanvasMapping,
  getPanForECGCanvasMapping,
  type ECGCanvasMapping,
} from './ecgViewportCamera';
import type {
  ECGViewState,
  ECGDataPresentation,
  ECGWaveformPayload,
  RenderWindowMetrics,
  ChannelLayout,
} from './ECGViewportTypes';

type ECGResolvedViewState = {
  viewState: ECGViewState;
  canvas: HTMLCanvasElement;
  dataPresentation?: ECGDataPresentation;
  frameOfReferenceUID: string;
  metrics: RenderWindowMetrics;
  waveform: ECGWaveformPayload;
};

class ECGResolvedView extends ResolvedViewportView<ECGResolvedViewState> {
  private cachedCanvasMapping?: ECGCanvasMapping;

  get zoom(): number {
    return Math.max(this.state.viewState.scale ?? 1, 0.001);
  }

  get pan(): Point2 {
    return getPanForECGCanvasMapping(this.getCanvasMapping());
  }

  /**
   * Converts 2D canvas coordinates into 3D world coordinates for ECG viewports,
   * resolving both horizontal sample index, amplitude, and channel/lead index.
   *
   * @param canvasPos - 2D pixel coordinates on the canvas
   * @returns 3D world coordinates [sampleIndex, amplitudeValue, leadIndex]
   */
  canvasToWorld(canvasPos: Point2): Point3 {
    const mapping = this.getCanvasMapping();
    const channelLayouts = this.getChannelLayouts();

    if (!channelLayouts.length) {
      return [0, 0, 0];
    }

    const subCanvasPos: Point2 = [
      (canvasPos[0] - mapping.xOffset) / mapping.effectiveRatio,
      (canvasPos[1] - mapping.yOffset) / mapping.effectiveRatio,
    ];

    const normX = subCanvasPos[0] / Math.max(1, this.state.metrics.ecgWidth);
    const normY = subCanvasPos[1] / Math.max(1, this.state.metrics.ecgHeight);

    let matchingLayout: ChannelLayout | undefined;
    const has2DBounds = channelLayouts.some((l) => l.minX !== undefined);

    if (has2DBounds) {
      matchingLayout = channelLayouts.find(
        (l) =>
          normX >= (l.minX ?? 0) &&
          normX <= (l.maxX ?? 1) &&
          normY >= (l.minY ?? 0) &&
          normY <= (l.maxY ?? 1)
      );

      if (!matchingLayout) {
        let minDistanceSq = Infinity;
        for (const layout of channelLayouts) {
          const midX = ((layout.minX ?? 0) + (layout.maxX ?? 1)) / 2;
          const midY = ((layout.minY ?? 0) + (layout.maxY ?? 1)) / 2;
          const distSq = (normX - midX) ** 2 + (normY - midY) ** 2;
          if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            matchingLayout = layout;
          }
        }
      }
    }

    if (!matchingLayout) {
      for (let index = 0; index < channelLayouts.length; index++) {
        const layout = channelLayouts[index];

        if (
          subCanvasPos[1] <= layout.yOffset ||
          index === channelLayouts.length - 1
        ) {
          matchingLayout = layout;
          break;
        }
      }
    }

    const channelLayout = matchingLayout || channelLayouts[0];

    if (!channelLayout) {
      return [0, 0, 0];
    }

    const z =
      channelLayout.regionIndex !== undefined
        ? channelLayout.regionIndex * 1000 + (channelLayout.leadIndex ?? 0)
        : (channelLayout.leadIndex ?? 0);
    const minX = channelLayout.minX ?? 0;
    const maxX = channelLayout.maxX ?? 1;
    const startIndex = channelLayout.startIndex ?? 0;
    const endIndex =
      channelLayout.endIndex ?? this.state.waveform.numberOfSamples;

    const spanX = Math.max(1e-6, maxX - minX);
    const fracX = Math.max(0, Math.min(1, (normX - minX) / spanX));
    const sampleIndex = Math.max(
      0,
      Math.min(
        this.state.waveform.numberOfSamples - 1,
        startIndex + fracX * (endIndex - startIndex)
      )
    );

    return [
      sampleIndex,
      (channelLayout.baseline - subCanvasPos[1]) /
        Math.max(1e-6, this.state.metrics.channelScale),
      z,
    ];
  }

  /**
   * Converts 3D world coordinates [sampleIndex, amplitudeValue, leadIndex]
   * into 2D canvas pixel coordinates.
   *
   * @param worldPos - 3D world coordinates
   * @returns 2D canvas pixel coordinates
   */
  worldToCanvas(worldPos: Point3): Point2 {
    const mapping = this.getCanvasMapping();
    const channelLayouts = this.getChannelLayouts();
    const rawZ = Math.round(worldPos[2]);
    const sampleIndex = worldPos[0];

    if (!channelLayouts.length) {
      return [0, 0];
    }

    const regionIdx = rawZ >= 1000 ? Math.floor(rawZ / 1000) : undefined;
    const leadIdx = rawZ >= 1000 ? rawZ % 1000 : rawZ;

    let layout: ChannelLayout | undefined;

    if (regionIdx !== undefined) {
      layout =
        channelLayouts.find(
          (l) =>
            l.regionIndex === regionIdx &&
            (l.leadIndex === leadIdx || l.leadIndex === undefined)
        ) || channelLayouts.find((l) => l.regionIndex === regionIdx);
    } else {
      const matchingLayouts = channelLayouts.filter(
        (l) => l.leadIndex === leadIdx
      );
      layout =
        matchingLayouts.find((l) => {
          const s = l.startIndex ?? 0;
          const e = l.endIndex ?? this.state.waveform.numberOfSamples;
          return sampleIndex >= s && sampleIndex <= e;
        }) || matchingLayouts[0];
    }

    if (!layout) {
      return [NaN, NaN];
    }

    const minX = layout.minX ?? 0;
    const maxX = layout.maxX ?? 1;
    const startIndex = layout.startIndex ?? 0;
    const endIndex = layout.endIndex ?? this.state.waveform.numberOfSamples;
    const sampleSpan = Math.max(1, endIndex - startIndex);
    const fracX = (sampleIndex - startIndex) / sampleSpan;
    const normX = minX + fracX * (maxX - minX);

    return [
      normX * this.state.metrics.ecgWidth * mapping.effectiveRatio +
        mapping.xOffset,
      (layout.baseline - worldPos[1] * this.state.metrics.channelScale) *
        mapping.effectiveRatio +
        mapping.yOffset,
    ];
  }

  /**
   * Returns the Frame of Reference UID associated with this resolved view.
   */
  getFrameOfReferenceUID(): string | undefined {
    return this.state.frameOfReferenceUID;
  }

  /**
   * Creates a new ECGResolvedView instance with the updated zoom level.
   *
   * @param zoom - New scale multiplier
   * @param canvasPoint - Optional pivot point on canvas for zooming
   * @returns Updated ECGResolvedView instance
   */
  withZoom(zoom: number, canvasPoint?: Point2): ECGResolvedView {
    const nextZoom = Math.max(zoom, 0.001);

    if (!canvasPoint) {
      return this.cloneWithViewState({
        ...this.state.viewState,
        scale: nextZoom,
        scaleMode: 'fit',
      });
    }

    return this.cloneWithViewState({
      ...this.state.viewState,
      anchorWorld: getAnchorWorldForCanvasPoint(
        canvasPoint,
        this.getCanvasMapping()
      ),
      anchorCanvas: [
        canvasPoint[0] / Math.max(this.state.canvas.clientWidth, 1),
        canvasPoint[1] / Math.max(this.state.canvas.clientHeight, 1),
      ],
      scale: nextZoom,
      scaleMode: 'fit',
    });
  }

  /**
   * Creates a new ECGResolvedView instance with the updated pan position.
   *
   * @param pan - 2D pan offset in canvas coordinates
   * @returns Updated ECGResolvedView instance
   */
  withPan(pan: Point2): ECGResolvedView {
    return this.cloneWithViewState({
      ...this.state.viewState,
      anchorWorld: getAnchorWorldForPan(
        [pan[0], pan[1]],
        this.getCanvasMapping()
      ),
    });
  }

  /**
   * Constructs the Cornerstone ICamera representation for this ECG view.
   */
  protected buildICamera(): ICamera {
    const mapping = this.getCanvasMapping();
    const canvasCenter: Point2 = [
      this.state.canvas.clientWidth / 2,
      this.state.canvas.clientHeight / 2,
    ];

    return {
      parallelProjection: true,
      focalPoint: this.canvasToWorld(canvasCenter),
      position: [0, 0, 0],
      viewUp: [0, -1, 0],
      parallelScale:
        this.state.canvas.clientHeight /
        2 /
        Math.max(mapping.effectiveRatio, 0.001),
      viewPlaneNormal: [0, 0, 1],
    };
  }

  /**
   * Resolves and caches the canvas transformation mapping based on current view state.
   */
  private getCanvasMapping(): ECGCanvasMapping {
    this.cachedCanvasMapping ||= resolveECGCanvasMapping({
      canvas: this.state.canvas,
      camera: this.state.viewState,
      metrics: this.state.metrics,
    });

    return this.cachedCanvasMapping;
  }

  /**
   * Generates the channel layouts for the current presentation, preserving 2D region bounds
   * and original lead indices for segmented multi-lead configurations.
   */
  private getChannelLayouts(): ChannelLayout[] {
    const traceRegions = this.state.dataPresentation?.traceRegions;
    const allChannels = this.state.waveform.channels;
    const visibleSet = this.state.dataPresentation?.visibleChannels
      ? new Set(this.state.dataPresentation.visibleChannels)
      : null;

    const timeWindow = computeECGTimeWindow(
      this.state.waveform,
      this.state.viewState
    );
    const effectiveStart = timeWindow.startIndex;
    const effectiveEnd = timeWindow.endIndex;
    const windowSpan = Math.max(1, effectiveEnd - effectiveStart);

    if (traceRegions && traceRegions.length > 0) {
      const layouts: ChannelLayout[] = [];
      for (let i = 0; i < traceRegions.length; i++) {
        const region = traceRegions[i];
        const leadIndices = region.leadIndices?.length
          ? region.leadIndices
          : [i];
        const leadCount = leadIndices.length;
        const minX = region.bounds?.minX ?? 0;
        const maxX = region.bounds?.maxX ?? 1;
        const totalMinY = region.bounds?.minY ?? 0;
        const totalMaxY = region.bounds?.maxY ?? 1;
        const slotHeight = (totalMaxY - totalMinY) / leadCount;

        for (let k = 0; k < leadCount; k++) {
          const leadIdx = leadIndices[k];
          if (visibleSet && !visibleSet.has(leadIdx)) {
            continue;
          }
          const channel = allChannels[leadIdx];
          if (!channel) {
            continue;
          }

          const minY = totalMinY + k * slotHeight;
          const maxY = minY + slotHeight;
          const baseline = ((minY + maxY) / 2) * this.state.metrics.ecgHeight;
          const itemHeight = (maxY - minY) * this.state.metrics.ecgHeight;

          const { segStartIndex, segEndIndex } = computeECGRegionSampleRange({
            region,
            channelDataLength: channel.data.length,
            effectiveStart,
            effectiveEnd,
          });

          layouts.push({
            channel,
            itemHeight,
            yOffset: maxY * this.state.metrics.ecgHeight,
            baseline,
            minX,
            maxX,
            minY,
            maxY,
            leadIndex: leadIdx,
            regionIndex: i,
            timeWindow: region.timeWindow,
            startIndex: segStartIndex,
            endIndex: segEndIndex,
          });
        }
      }
      return layouts;
    }

    const visibleChannels = getVisibleECGChannels(
      allChannels,
      this.state.dataPresentation?.visibleChannels
    );

    return computeECGChannelLayouts({
      visibleChannels,
      channelScale: this.state.metrics.channelScale,
    }).map((layout) => ({
      ...layout,
      minX: 0,
      maxX: 1,
      minY: 0,
      maxY: 1,
      startIndex: effectiveStart,
      endIndex: effectiveEnd,
      leadIndex: allChannels.indexOf(layout.channel),
    }));
  }

  private cloneWithViewState(viewState: ECGViewState): ECGResolvedView {
    return new ECGResolvedView({
      ...this.state,
      viewState,
    });
  }
}

export type { ECGResolvedViewState };
export default ECGResolvedView;
