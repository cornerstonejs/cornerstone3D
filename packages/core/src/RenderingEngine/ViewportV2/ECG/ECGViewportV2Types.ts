import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';

export interface ECGChannelData {
  name: string;
  data: Int16Array;
  min: number;
  max: number;
}

export interface ECGWaveformPayload {
  channels: ECGChannelData[];
  numberOfChannels: number;
  numberOfSamples: number;
  samplingFrequency: number;
  bitsAllocated: number;
  sampleInterpretation: string;
  multiplexGroupLabel?: string;
  calibration?: unknown;
}

export interface ECGPresentationProps extends BasePresentationProps {
  visibleChannels?: number[];
}

export interface ECGCamera {
  timeRange: [number, number];
  valueRange: [number, number];
  scrollOffset?: number;
}

export interface ECGProperties {
  lineWidth?: number;
  sweepSpeed?: number;
  amplitudeScale?: number;
  showGrid?: boolean;
}

/** @deprecated Use ECGCamera instead */
export type ECGViewState = ECGCamera;

/** @deprecated Use ECGProperties instead */
export type ECGViewportPresentation = ECGProperties;

export interface ECGViewportV2Input {
  id: string;
  element: HTMLDivElement;
  dataProvider?: DataProvider;
  renderPathResolver?: RenderPathResolver;
}

export interface ChannelLayout {
  channel: ECGChannelData;
  itemHeight: number;
  yOffset: number;
  baseline: number;
}

export interface RenderWindowMetrics {
  ecgWidth: number;
  ecgHeight: number;
  channelScale: number;
  worldToCanvasRatio: number;
  xOffsetCanvas: number;
  yOffsetCanvas: number;
}

export interface ECGCanvasRenderContext extends BaseViewportRenderContext {
  type: 'ecg';
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
}

export interface ECGCanvasRendering
  extends MountedRendering<{
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    waveform: ECGWaveformPayload;
    metrics: RenderWindowMetrics;
    currentCamera?: ECGCamera;
    currentProperties?: ECGProperties;
    currentPresentation?: ECGPresentationProps;
  }> {
  renderMode: 'signal2d';
}
