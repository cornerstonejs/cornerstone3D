import type { ViewportProperties } from './ViewportProperties';

type ECGViewportProperties = ViewportProperties & {
  visibleChannels?: number[];
  sweepSpeed?: number;
  sensitivityMmMv?: number;
  showAmplitudeLabels?: boolean;
};

export type { ECGViewportProperties as default };
