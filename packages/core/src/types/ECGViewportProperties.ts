import type { ViewportProperties } from './ViewportProperties';

type ECGViewportProperties = ViewportProperties & {
  visibleChannels?: number[];
};

export type { ECGViewportProperties as default };
