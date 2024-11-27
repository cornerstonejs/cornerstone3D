import type Point4 from './Point4';

interface CPUFallbackColormapData {
  name: string;
  numOfColors?: number;
  colors?: Point4[];
  segmentedData?: unknown;
  numColors?: number;
  gamma?: number;
}

export type { CPUFallbackColormapData as default };
