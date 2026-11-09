import type ECGViewport from '../RenderingEngine/ECGViewport';

/**
 * @deprecated The type of the deprecated ECG class (`ViewportType.ECG_LEGACY`).
 * `ViewportType.ECG` gives the Generic Viewport ECG family; use
 * `ECGGenericViewport`, and `utilities.viewportSupportsWaveform` as the guard.
 */
export type IECGViewport = ECGViewport;
