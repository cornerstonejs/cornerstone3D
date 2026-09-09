import type { AABB2 } from '../../../types';
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

/** Normalized 2D bounding region for multi-lead or segmented ECG layouts */
export interface TraceRegion {
  id?: string;
  bounds: AABB2;
  leadIndices: number[];
  timeWindow?: [number, number];
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
  traceRegions?: TraceRegion[];
}

export interface ECGViewState extends ViewportCameraBase<[number, number]> {
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

export type ECGGenericViewportInput = ECGViewportInput;

/** @internal */
export interface ChannelLayout {
  channel: ECGChannelData;
  itemHeight: number;
  yOffset: number;
  baseline: number;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  leadIndex?: number;
  regionIndex?: number;
  timeWindow?: [number, number];
  startIndex?: number;
  endIndex?: number;
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
