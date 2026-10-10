import type { ViewportProperties } from './ViewportProperties';

type ECGViewportProperties = ViewportProperties & {
  visibleChannels?: number[];
  sweepSpeed?: number;
  /**
   * Amplitude sensitivity in mm/mV (e.g. 10 mm/mV means 1 mV = 10 mm tall on paper).
   * When undefined, operates in auto-fit mode without fixed mm/mV scaling.
   */
  sensitivityMmMv?: number;
  showAmplitudeLabels?: boolean;
  layoutType?: '12x1' | '6x2' | '3x4' | '3x4+1';
};

export type { ECGViewportProperties as default };
