import type { AABB2 } from '../../../types';
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

export type ECGPresentationProps = BasePresentationProps;

/**
 * Navigation and layout of the ECG viewport.
 *
 * Every option here moves a world point on the canvas, so a change fires
 * `CAMERA_MODIFIED` (GENVIEW-STATE-1).
 */
export interface ECGViewState extends ViewportCameraBase<[number, number]> {
  /**
   * Time window in ms that the `12x1` rows show. A multi-column layout always
   * shows the full record and ignores this value.
   */
  timeRange: [number, number];
  valueRange: [number, number];
  scrollOffset?: number;
  /**
   * Horizontal sweep speed in mm/s. Defaults to 25 mm/s. Use 50 mm/s for
   * high-speed recordings.
   */
  sweepSpeed?: number;
  /**
   * Amplitude sensitivity in mm/mV, for example 10 mm/mV draws 1 mV as 10 mm.
   * When undefined, the trace amplitudes fit the viewport height, and the grid
   * shows no millivolt labels.
   */
  sensitivityMmMv?: number;
  /** Multiplier on the drawn amplitude. Defaults to 1. */
  amplitudeScale?: number;
  traceRegions?: TraceRegion[];
  /**
   * Indices of the visible channels. A hidden lead keeps its grid cell, and a
   * row with no visible lead gets zero height. Undefined shows every channel.
   */
  visibleChannels?: number[];
  /**
   * Lead arrangement:
   * - '12x1': one row for each lead, with the `timeRange` window. (Default)
   * - '6x2': 6 rows, 2 columns. Each column shows half of the record.
   * - '3x4': 3 rows, 4 columns. Each column shows a quarter of the record.
   * - '3x4+1': the `3x4` grid plus a rhythm strip of the full record.
   */
  layoutType?: '12x1' | '6x2' | '3x4' | '3x4+1';
}

/** Appearance options that do not move the trace. */
export interface ECGProperties {
  lineWidth?: number;
  showGrid?: boolean;
  /**
   * Whether to render millivolt labels on the grid. Applies only when
   * `ECGViewState.sensitivityMmMv` is set. Defaults to true.
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

/**
 * Options of `ECGViewport.resetViewState`. Each option defaults to true except
 * `resetTimeRange`. The layout options of the view state are never reset.
 */
export interface ECGResetViewStateOptions {
  resetPan?: boolean;
  resetZoom?: boolean;
  resetTimeRange?: boolean;
}
