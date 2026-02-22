import type { ViewportType } from '../enums';
import type Point2 from './Point2';

export interface InternalECGCamera {
  panWorld?: Point2;
  parallelScale?: number;
}

export interface ECGViewportInput {
  id: string;
  renderingEngineId: string;
  type: ViewportType;
  element: HTMLDivElement;
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
  defaultOptions: unknown;
  canvas: HTMLCanvasElement;
}

export interface ECGChannel {
  name: string;
  data: Int16Array;
  visible: boolean;
  /** Cached minimum sample value */
  min: number;
  /** Cached maximum sample value */
  max: number;
}

export interface ECGWaveformData {
  channels: ECGChannel[];
  numberOfChannels: number;
  numberOfSamples: number;
  samplingFrequency: number;
  bitsAllocated: number;
  sampleInterpretation: string;
  multiplexGroupLabel: string;
}
