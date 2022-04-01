import LookupTable from './lookupTable';
import CPU_COLORMAPS from '../../../../constants/cpuColormaps';
import {
  CPUFallbackColormap,
  CPUFallbackColormapData,
  Point4,
} from '../../../../types';

const COLOR_TRANSPARENT: Point4 = [0, 0, 0, 0];

/**
 *  Generate linearly spaced vectors
 *  http://cens.ioc.ee/local/man/matlab/techdoc/ref/linspace.html
 * @param {Number} a A number representing the first vector
 * @param {Number} b A number representing the second vector
 * @param {Number} n The number of linear spaced vectors to generate
 * @returns {Array} An array of points representing linear spaced vectors.
 * @memberof Colors
 */
function linspace(a: number, b: number, n: number): number[] {
  n = n === null ? 100 : n;

  const increment = (b - a) / (n - 1);
  const vector = [];

  while (n-- > 0) {
    vector.push(a);
    a += increment;
  }

  // Make sure the last item will always be "b" because most of the
  // Time we'll get numbers like 1.0000000000000002 instead of 1.
  vector[vector.length - 1] = b;

  return vector;
}

/**
 * Returns the "rank/index" of the element in a sorted array if found or the highest index if not. Uses (binary search)
 * @param {Array} array A sorted array to search in
 * @param {any} elem the element in the array to search for
 * @returns {number} The rank/index of the element in the given array
 * @memberof Colors
 */
function getRank(array, elem) {
  let left = 0;
  let right = array.length - 1;

  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    const midElem = array[mid];

    if (midElem === elem) {
      return mid;
    } else if (elem < midElem) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return left;
}

/**
 * Find the indices into a sorted array a such that, if the corresponding elements
 * In v were inserted before the indices, the order of a would be preserved.
 *  http://lagrange.univ-lyon1.fr/docs/numpy/1.11.0/reference/generated/numpy.searchsorted.html
 * @param {Array} inputArray The array where the values will be inserted
 * @param {Array} values An array of the values to be inserted into the inputArray
 * @returns {Array} The indices where elements should be inserted to maintain order.
 * @memberof Colors
 */
function searchSorted(inputArray, values) {
  let i;
  const indexes = [];
  const len = values.length;

  inputArray.sort(function (a, b) {
    return a - b;
  });

  for (i = 0; i < len; i++) {
    indexes[i] = getRank(inputArray, values[i]);
  }

  return indexes;
}

/**
 * Creates an *N* -element 1-d lookup table
 * @param {Number} N The number of elements in the result lookup table
 * @param {Array} data represented by a list of x,y0,y1 mapping correspondences. Each element in this
 * List represents how a value between 0 and 1 (inclusive) represented by x is mapped to
 * A corresponding value between 0 and 1 (inclusive). The two values of y are to allow for
 * Discontinuous mapping functions (say as might be found in a sawtooth) where y0 represents
 * The value of y for values of x <= to that given, and y1 is the value to be used for x >
 * Than that given). The list must start with x=0, end with x=1, and all values of x must be
 * In increasing order. Values between the given mapping points are determined by simple linear
 * Interpolation.
 * @param {any} gamma value denotes a "gamma curve" value which adjusts the brightness
 * at the bottom and top of the map.
 * @returns {any[]} an array "result" where result[x*(N-1)] gives the closest value for
 * Values of x between 0 and 1.
 * @memberof Colors
 */
function makeMappingArray(N, data, gamma) {
  let i;
  const x = [];
  const y0 = [];
  const y1 = [];
  const lut = [];

  gamma = gamma === null ? 1 : gamma;

  for (i = 0; i < data.length; i++) {
    const element = data[i];

    x.push((N - 1) * element[0]);
    y0.push(element[1]);
    y1.push(element[1]);
  }

  const xLinSpace = linspace(0, 1, N);

  for (i = 0; i < N; i++) {
    xLinSpace[i] = (N - 1) * Math.pow(xLinSpace[i], gamma);
  }

  const xLinSpaceIndexes = searchSorted(x, xLinSpace);

  for (i = 1; i < N - 1; i++) {
    const index = xLinSpaceIndexes[i];
    const colorPercent =
      (xLinSpace[i] - x[index - 1]) / (x[index] - x[index - 1]);
    const colorDelta = y0[index] - y1[index - 1];

    lut[i] = colorPercent * colorDelta + y1[index - 1];
  }

  lut[0] = y1[0];
  lut[N - 1] = y0[data.length - 1];

  return lut;
}

/**
 * Creates a Colormap based on lookup tables using linear segments.
 * @param {{red:Array, green:Array, blue:Array}} segmentedData An object with a red, green and blue entries.
 * Each entry should be a list of x, y0, y1 tuples, forming rows in a table.
 * @param {Number} N The number of elements in the result Colormap
 * @param {any} gamma value denotes a "gamma curve" value which adjusts the brightness
 * at the bottom and top of the Colormap.
 * @returns {Array} The created Colormap object
 * @description The lookup table is generated using linear interpolation for each
 *  Primary color, with the 0-1 domain divided into any number of
 * Segments.
 * https://github.com/stefanv/matplotlib/blob/3f1a23755e86fef97d51e30e106195f34425c9e3/lib/matplotlib/colors.py#L663
 * @memberof Colors
 */
function createLinearSegmentedColormap(segmentedData, N, gamma) {
  let i;
  const lut = [];

  N = N === null ? 256 : N;
  gamma = gamma === null ? 1 : gamma;

  const redLut = makeMappingArray(N, segmentedData.red, gamma);
  const greenLut = makeMappingArray(N, segmentedData.green, gamma);
  const blueLut = makeMappingArray(N, segmentedData.blue, gamma);

  for (i = 0; i < N; i++) {
    const red = Math.round(redLut[i] * 255);
    const green = Math.round(greenLut[i] * 255);
    const blue = Math.round(blueLut[i] * 255);
    const rgba = [red, green, blue, 255];

    lut.push(rgba);
  }

  return lut;
}

/**
 * Return all available colormaps (id and name)
 * @returns {Array<{id,key}>} An array of colormaps with an object containing the "id" and display "name"
 * @memberof Colors
 */
export function getColormapsList() {
  const colormaps = [];
  const keys = Object.keys(CPU_COLORMAPS);

  keys.forEach(function (key) {
    if (CPU_COLORMAPS.hasOwnProperty(key)) {
      const colormap = CPU_COLORMAPS[key];

      colormaps.push({
        id: key,
        name: colormap.name,
      });
    }
  });

  colormaps.sort(function (a, b) {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();

    if (aName === bName) {
      return 0;
    }

    return aName < bName ? -1 : 1;
  });

  return colormaps;
}

/**
 * Return a colorMap object with the provided id and colormapData
 * if the Id matches existent colorMap objects (check colormapsData) the colormapData is ignored.
 * if the colormapData is not empty, the colorMap will be added to the colormapsData list. Otherwise, an empty colorMap object is returned.
 * @param {string} id The ID of the colormap
 * @param {Object} colormapData - An object that can contain a name, numColors, gama, segmentedData and/or colors
 * @returns {*} The Colormap Object
 * @memberof Colors
 */
export function getColormap(
  id: string,
  colormapData?: CPUFallbackColormapData
): CPUFallbackColormap {
  let colormap = CPU_COLORMAPS[id];

  if (!colormap) {
    colormap = CPU_COLORMAPS[id] = colormapData || {
      name: '',
      colors: [],
    };
  }

  if (!colormap.colors && colormap.segmentedData) {
    colormap.colors = createLinearSegmentedColormap(
      colormap.segmentedData,
      colormap.numColors,
      colormap.gamma
    );
  }

  const cpuFallbackColormap: CPUFallbackColormap = {
    getId() {
      return id;
    },

    getColorSchemeName() {
      return colormap.name;
    },

    setColorSchemeName(name) {
      colormap.name = name;
    },

    getNumberOfColors() {
      return colormap.colors.length;
    },

    setNumberOfColors(numColors) {
      while (colormap.colors.length < numColors) {
        colormap.colors.push(COLOR_TRANSPARENT);
      }

      colormap.colors.length = numColors;
    },

    getColor(index) {
      if (this.isValidIndex(index)) {
        return colormap.colors[index];
      }

      return COLOR_TRANSPARENT;
    },

    getColorRepeating(index) {
      const numColors = colormap.colors.length;

      index = numColors ? index % numColors : 0;

      return this.getColor(index);
    },

    setColor(index, rgba) {
      if (this.isValidIndex(index)) {
        colormap.colors[index] = rgba;
      }
    },

    addColor(rgba) {
      colormap.colors.push(rgba);
    },

    insertColor(index, rgba) {
      if (this.isValidIndex(index)) {
        colormap.colors.splice(index, 1, rgba);
      }
    },

    removeColor(index) {
      if (this.isValidIndex(index)) {
        colormap.colors.splice(index, 1);
      }
    },

    clearColors() {
      colormap.colors = [];
    },

    buildLookupTable(lut) {
      if (!lut) {
        return;
      }

      const numColors = colormap.colors.length;

      lut.setNumberOfTableValues(numColors);

      for (let i = 0; i < numColors; i++) {
        lut.setTableValue(i, colormap.colors[i]);
      }
    },

    createLookupTable() {
      const lut = new LookupTable();

      this.buildLookupTable(lut);

      return lut;
    },

    isValidIndex(index) {
      return index >= 0 && index < colormap.colors.length;
    },
  };

  return cpuFallbackColormap;
}
