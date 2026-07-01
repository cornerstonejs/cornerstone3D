import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type { ViewportCameraBase } from '../ViewportCameraTypes';

export interface ECGChannelData {
  name: string;
  data: Int16Array;
  min: number;
  max: number;
}

/** @internal */
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

export interface ECGViewState extends ViewportCameraBase<[number, number]> {
  timeRange: [number, number];
  valueRange: [number, number];
  scrollOffset?: number;
}

export interface ECGProperties {
  lineWidth?: number;
  /**
   * Horizontal sweep speed in mm/s. Standard ECG paper speed.
   * Defaults to 25 mm/s. Use 50 mm/s for high-speed recordings.
   */
  sweepSpeed?: number;
  /**
   * Amplitude sensitivity in mm/mV. Standard ECG amplitude calibration.
   * Defaults to 10 mm/mV (1 mV = 10 mm tall on paper).
   */
  sensitivityMmMv?: number;
  amplitudeScale?: number;
  showGrid?: boolean;
  /**
   * Whether to render millivolt labels on the Y-axis grid lines.
   * Defaults to true when sensitivityMmMv is set.
   */
  showAmplitudeLabels?: boolean;
}

export type ECGDataPresentation = ECGPresentationProps & ECGProperties;

export interface ECGViewportInput {
  id: string;
  element: HTMLDivElement;
  renderingEngineId: string;
  dataProvider?: DataProvider;
  renderPathResolver?: RenderPathResolver;
}

export type ECGGenericViewportInput = ECGViewportInput;

/** @internal */
export interface ChannelLayout {
  channel: ECGChannelData;
  itemHeight: number;
  yOffset: number;
  baseline: number;
}

/** @internal */
export interface RenderWindowMetrics {
  ecgWidth: number;
  ecgHeight: number;
  channelScale: number;
  worldToCanvasRatio: number;
  xOffsetCanvas: number;
  yOffsetCanvas: number;
}

/** @internal */
export interface ECGCanvasRenderContext extends BaseViewportRenderContext {
  type: 'ecg';
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
}

/** @internal */
export type ECGCanvasRendering = MountedRendering<{
  renderMode: 'signal2d';
  canvas: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
  metrics: RenderWindowMetrics;
  currentCamera?: ECGViewState;
  currentDataPresentation?: ECGDataPresentation;
}>;
