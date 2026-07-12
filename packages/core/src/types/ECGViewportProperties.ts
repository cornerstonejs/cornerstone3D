import type { ViewportProperties } from './ViewportProperties';

type ECGViewportProperties = ViewportProperties & {
  visibleChannels?: number[];
  sweepSpeed?: number;
  sensitivityMmMv?: number;
  showAmplitudeLabels?: boolean;
  layoutType?: '12x1' | '6x2' | '3x4' | '3x4+1';
};

export type { ECGViewportProperties as default };
