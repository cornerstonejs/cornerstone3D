import type {
  BasePresentationProps,
  DataProvider,
  MountedRendering,
  RenderPathResolver,
  ViewportBackendContext,
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
  lineWidth?: number;
  sweepSpeed?: number;
  amplitudeScale?: number;
  showGrid?: boolean;
  visibleChannels?: number[];
}

export interface ECGViewState {
  timeRange: [number, number];
  valueRange: [number, number];
  scrollOffset?: number;
}

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

export interface ECGCanvasBackendContext extends ViewportBackendContext {
  viewportKind: 'ecg';
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
  }> {
  role: 'signal';
  renderMode: 'signal2d';
}
