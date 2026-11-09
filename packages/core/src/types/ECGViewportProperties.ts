import type { ViewportProperties } from './ViewportProperties';
import type { ECGTraceLayout } from '../RenderingEngine/GenericViewport/ECG/ECGViewportTypes';

type ECGViewportProperties = ViewportProperties & {
  visibleChannels?: number[];
  sweepSpeed?: number;
  /**
   * Amplitude sensitivity in mm/mV (e.g. 10 mm/mV means 1 mV = 10 mm tall on paper).
   * When undefined, operates in auto-fit mode without fixed mm/mV scaling.
   */
  sensitivityMmMv?: number;
  showAmplitudeLabels?: boolean;
  /** The trace layout: a registered name, or a full definition. */
  traceLayout?: ECGTraceLayout;
  /** @deprecated Use `traceLayout`, which accepts the same names. */
  layoutType?: string;
};

export type { ECGViewportProperties as default };
