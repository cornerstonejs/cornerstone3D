import Point4 from './Point4';

type CPUFallbackColormapData = {
  name: string;
  numOfColors?: number;
  colors?: Point4[];
  segmentedData?: unknown;
  numColors?: number;
  gamma?: number;
};

export default CPUFallbackColormapData;
