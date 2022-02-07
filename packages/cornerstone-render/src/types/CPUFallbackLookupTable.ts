import Point4 from './Point4';

interface CPUFallbackLookupTable {
  setNumberOfTableValues: (number: number) => void;
  setRamp: (ramp: string) => void;
  setTableRange: (start: number, end: number) => void;
  setHueRange: (start: number, end: number) => void;
  setSaturationRange: (start: number, end: number) => void;
  setValueRange: (start: number, end: number) => void;
  setRange: (start: number, end: number) => void;
  setAlphaRange: (start: number, end: number) => void;
  getColor: (scalar: number) => Point4;
  build: (force: boolean) => void;
  setTableValue(index: number, rgba: Point4);
}

export default CPUFallbackLookupTable;
