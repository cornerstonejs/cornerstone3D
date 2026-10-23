import type { AABB2, ViewportInputOptions } from '../../../types';
import type {
  BaseViewportRenderContext,
  BasePresentationProps,
  DataProvider,
  MountedRendering,
  RenderPathResolver,
} from '../ViewportArchitectureTypes';
import type { ViewportCameraBase } from '../ViewportCameraTypes';
import type ECGResolvedView from './ECGResolvedView';

export interface ECGChannelData {
  name: string;
  /** Lead code value, from `ChannelSourceSequence`. */
  code?: string;
  data: Int16Array;
  min: number;
  max: number;
}

/**
 * Names of the registered trace layouts. An application adds a name with an
 * augmentation, and registers the layout with `registerECGTraceLayout`:
 *
 * ```ts
 * declare module '@cornerstonejs/core' {
 *   interface ECGTraceLayoutRegistry {
 *     'myOrg:6x2+1': true;
 *   }
 * }
 * registerECGTraceLayout('myOrg:6x2+1', (context) => ({ regions: [...] }));
 * ```
 */
export interface ECGTraceLayoutRegistry {
  /** One row for each lead. Each row shows the time window of the view. */
  '12x1': true;
  /** 6 rows and 2 columns. Each column shows half of the record. */
  '6x2': true;
  /** 3 rows and 4 columns. Each column shows a quarter of the record. */
  '3x4': true;
  /** The `3x4` grid, and a rhythm strip of lead II with the full record. */
  '3x4+1': true;
}

/**
 * A registered layout name. A name that is not in `ECGTraceLayoutRegistry` is
 * accepted too, because a hanging protocol in JSON can give any name.
 */
export type ECGTraceLayoutName = keyof ECGTraceLayoutRegistry | (string & {});

/** One trace of a trace layout. */
export interface ECGTraceRegion {
  id?: string;
  /** Label that the viewport draws. Defaults to the channel name. */
  label?: string;
  /** Bounds as fractions, 0 to 1, of the layout area. */
  bounds: AABB2;
  /**
   * The lead: a channel index, or the lead code value of the channel, for
   * example `5.6.3-9-2` (SCPECG) or `2:2` (MDC) for lead II. A channel with
   * no code value matches by its code meaning.
   */
  lead: number | string;
  /**
   * The part of the record that the region shows. `'view'` follows the time
   * window of the view state. A pair gives a fixed part, as fractions of the
   * record. Defaults to `'view'`.
   */
  time?: 'view' | [number, number];
}

/** A full trace layout. */
export interface ECGTraceLayoutDefinition {
  regions: ECGTraceRegion[];
}

/**
 * The trace layout of an ECG viewport: a registered name, or a full
 * definition. A hanging protocol gives either form in the one attribute
 * `traceLayout`.
 */
export type ECGTraceLayout = ECGTraceLayoutName | ECGTraceLayoutDefinition;

/** What a layout factory receives to build a definition for one waveform. */
export interface ECGTraceLayoutContext {
  channels: { name: string; code?: string }[];
}

export type ECGTraceLayoutFactory = (
  context: ECGTraceLayoutContext
) => ECGTraceLayoutDefinition;

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
   * Time window in ms that the regions with `time: 'view'` show. A layout with
   * no such region shows the full record and ignores this value.
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
  /**
   * Indices of the visible channels. A hidden lead keeps its region, and a
   * band with no visible lead gets zero height. Undefined shows every channel.
   */
  visibleChannels?: number[];
  /**
   * The trace layout: a registered name, or a full definition. The view
   * state keeps the value as the caller gave it. Defaults to `'12x1'`.
   */
  traceLayout?: ECGTraceLayout;
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
  /** `traceLayout` gives the trace layout before the first data load. */
  defaultOptions?: Pick<ViewportInputOptions, 'traceLayout'>;
}

export type ECGGenericViewportInput = ECGViewportInput;

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
