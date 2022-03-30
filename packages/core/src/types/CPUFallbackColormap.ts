import Point4 from './Point4';
import CPUFallbackLookupTable from './CPUFallbackLookupTable';

interface CPUFallbackColormap {
  /** Get id of colormap */
  getId: () => string;
  getColorSchemeName: () => string;
  setColorSchemeName: (name: string) => void;
  getNumberOfColors: () => number;
  setNumberOfColors: (numColors: number) => void;
  getColor: (index: number) => Point4;
  getColorRepeating: (index: number) => Point4;
  setColor: (index: number, rgba: Point4) => void;
  addColor: (rgba: Point4) => void;
  insertColor: (index: number, rgba: Point4) => void;
  removeColor: (index: number) => void;
  clearColors: () => void;
  buildLookupTable: (lut: CPUFallbackLookupTable) => void;
  createLookupTable: () => CPUFallbackLookupTable;
  isValidIndex: (index: number) => boolean;
}

export default CPUFallbackColormap;
