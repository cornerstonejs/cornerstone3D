import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type { ViewportCameraBase } from '../ViewportCameraTypes';
import type { ECGRenderMetrics } from '../../../utilities/ECGUtilities';
import type ECGResolvedView from './ECGResolvedView';

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
  /**
   * ECG lead layout arrangement:
   * - '12x1': 12 rows, 1 column. Full duration (10s) per lead. (Default)
   * - '6x2': 6 rows, 2 columns. 5s duration per lead.
   * - '3x4': 3 rows, 4 columns. 2.5s duration per lead.
   * - '3x4+1': 3 rows of 4 columns (2.5s duration) plus 1 continuous rhythm lead (full 10s) at the bottom.
   */
  layoutType?: '12x1' | '6x2' | '3x4' | '3x4+1';
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

/**
 * World geometry of one ECG frame.
 *
 * The type is an alias of `ECGRenderMetrics`, which `computeECGRenderMetrics`
 * returns. The two used to be separate declarations with the same shape, and
 * `CanvasECGRenderPath` cast between them, which hid any future drift.
 *
 * @internal
 */
export type RenderWindowMetrics = ECGRenderMetrics;

/** @internal */
export interface ECGCanvasRenderContext extends BaseViewportRenderContext {
  type: 'ecg';
  element: HTMLDivElement;
  canvas: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
  /**
   * Returns the resolved view of the current frame, which owns the world
   * geometry and the canvas transform. The render path reads the geometry from
   * here in place of computing it, so the viewport and the drawn frame cannot
   * disagree. The result is undefined while no waveform is mounted.
   */
  getResolvedView(): ECGResolvedView | undefined;
}

/**
 * Mounted rendering state of the canvas ECG render path.
 *
 * The record holds no view state and no geometry. `ECGResolvedView` owns both,
 * and the render path reads them through `ECGCanvasRenderContext`.
 *
 * @internal
 */
export type ECGCanvasRendering = MountedRendering<{
  renderMode: 'signal2d';
  canvas: HTMLCanvasElement;
  canvasContext: CanvasRenderingContext2D;
}>;
