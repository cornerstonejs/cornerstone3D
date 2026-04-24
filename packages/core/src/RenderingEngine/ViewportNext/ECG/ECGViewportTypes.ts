import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type ICamera from '../../../types/ICamera';
import type { ViewportCameraBase } from '../ViewportCameraTypes';

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

export interface ECGCamera
  extends ViewportCameraBase<[number, number]>,
    ICamera {
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

export type ECGDataPresentation = ECGPresentationProps & ECGProperties;

export interface ECGViewportInput {
  id: string;
  element: HTMLDivElement;
  renderingEngineId: string;
  dataProvider?: DataProvider;
  renderPathResolver?: RenderPathResolver;
}

export type ECGViewportNextInput = ECGViewportInput;

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

export type ECGCanvasRendering = MountedRendering<{
  renderMode: 'signal2d';
  canvas: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
  metrics: RenderWindowMetrics;
  currentCamera?: ECGCamera;
  currentDataPresentation?: ECGDataPresentation;
}>;
