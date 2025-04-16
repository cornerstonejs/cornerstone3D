import type Point3 from '../types/Point3';
import type BoundsIJK from '../types/BoundsIJK';
import type { PixelDataTypedArray } from '../types';

/**
 * The RLERun specifies a contigous run of values for a row,
 * where all indices (i only) from `[start,end)` have the specified
 * value.
 */
export type RLERun<T> = {
  value: T;
  start: number;
  end: number;
};

/**
 * Performs adjacent flood fill in all directions, for a true flood fill
 */
const ADJACENT_ALL = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
  [0, 0, 1],
];

const ADJACENT_SINGLE_PLANE = [
  [0, -1, 0],
  [0, 1, 0],
];

/**
 * Adjacent in and out do a flood fill in only one of depth (in or out) directions.
 * That improves the performance, as well as looks much nicer for many flood operations.
 */
const ADJACENT_IN = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, -1],
];
const ADJACENT_OUT = [
  [0, -1, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/**
 * A type that has converts to and from an integer plane representation.
 */
export type PlaneNormalizer = {
  toIJK: (ijkPrime: Point3) => Point3;
  fromIJK: (ijk: Point3) => Point3;
  boundsIJKPrime: BoundsIJK;
};

/**
 * RLE based implementation of a voxel map.
 * This can be used as single or multi-plane, as the underlying indexes are
 * mapped to rows and hte rows are indexed started at 0 and continuing
 * incrementing for all rows in the multi-plane voxel.
 */
export default class RLEVoxelMap<T> {
  public normalizer: PlaneNormalizer;

  /**
   * The rows for the voxel map is a map from the j index location (or for
   * volumes, `j + k*height`) to a list of RLE runs.  That is, each entry in
   * the rows specifies the voxel data for a given row in the image.
   * Then, the RLE runs themselves specify the pixel values for given rows as
   * a pair of start/end indices, plus the value to apply.
   */
  protected rows = new Map<number, RLERun<T>[]>();
  /** The height of the images stored in the voxel map (eg the height of each plane) */
  public height = 1;
  /** The width of the image planes */
  public width = 1;
  /**
   * The number of image planes stored (the depth of the indices), with the k
   * index going from 0...depth.
   */
  public depth = 1;
  /**
   * A multiplier value to go from j values to overall index values.
   */
  protected jMultiple = 1;
  /**
   * A multiplier value to go from k values to overall index values.
   */
  protected kMultiple = 1;
  /** Number of components in the value */
  protected numComps = 1;

  /**
   * The default value returned for get.
   * This allows treating the voxel map more like scalar data, returning the right
   * default value for unset values.
   * Set to 0 by default, but any maps where 0 not in T should update this value.
   */
  public defaultValue: T;

  /**
   * The constructor for creating pixel data.
   */
  public pixelDataConstructor = Uint8Array;

  /**
   * Copies the data in source into the map.
   */
  public static copyMap<T>(
    destination: RLEVoxelMap<T>,
    source: RLEVoxelMap<T>
  ) {
    for (const [index, row] of source.rows) {
      destination.rows.set(index, structuredClone(row));
    }
  }

  constructor(width: number, height: number, depth = 1) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.jMultiple = width;
    this.kMultiple = this.jMultiple * height;
  }

  /**
   *  This is a function on the voxel manager, to get the RLE scalar data.
   * @returns an array of the given type for the data.
   */
  public static getScalarData = function (ArrayType = Uint8ClampedArray) {
    const scalarData = new ArrayType(this.frameSize);
    this.map.updateScalarData(scalarData);
    return scalarData;
  };

  /**
   * Update the scalar data with the current RLE state
   * @param scalarData - old scalar data to update
   */
  public updateScalarData = function (scalarData: PixelDataTypedArray) {
    scalarData.fill(0);
    const callback = (index, rle, row) => {
      const { start, end, value } = rle;
      for (let i = start; i < end; i++) {
        scalarData[index + i] = value;
      }
    };
    this.forEach(callback);
  };

  /**
   * Gets the value encoded in the map at the given index, which is
   * an integer `[i,j,k]` voxel index, equal to `index=i+(j+k*height)*width`
   * value (eg a standard ScalarData index for stack/volume single component
   * indices.)
   *
   * Returns defaultValue if the RLE value is not found.
   */
  public get = (index: number): T => {
    const i = index % this.jMultiple;
    const j = (index - i) / this.jMultiple;
    const rle = this.getRLE(i, j);
    return rle?.value ?? this.defaultValue;
  };

  public toIJK(index: number): Point3 {
    const i = index % this.jMultiple;
    const j = ((index - i) / this.jMultiple) % this.height;
    const k = Math.floor(index / this.kMultiple);
    return [i, j, k];
  }

  public toIndex([i, j, k]: Point3) {
    return i + k * this.kMultiple + j * this.jMultiple;
  }

  /**
   * Gets a list of RLERun values which specify the data on the row j
   * This allows applying or modifying the run directly.  See CanvasActor
   * for an example in the RLE rendering.
   */
  protected getRLE(i: number, j: number, k = 0): RLERun<T> {
    const row = this.rows.get(j + k * this.height);
    if (!row) {
      return;
    }
    const index = this.findIndex(row, i);
    const rle = row[index];
    return i >= rle?.start ? rle : undefined;
  }

  /**
   *  Indicate if the map has the given value
   */
  public has(index: number): boolean {
    const i = index % this.jMultiple;
    const j = (index - i) / this.jMultiple;
    const rle = this.getRLE(i, j);
    return rle?.value !== undefined;
  }

  /**
   * Delete any value at the given index;
   */
  public delete(index: number) {
    const i = index % this.width;
    const j = (index - i) / this.width;
    const row = this.rows.get(j);
    if (!row) {
      return;
    }
    const rleIndex = this.findIndex(row, i);
    const rle = row[rleIndex];
    if (!rle || rle.start > i) {
      // Value not in RLE, so no need to delete
      return;
    }
    if (rle.end === i + 1) {
      // Value at end, so decrease the length.
      // This also handles hte case of the value at the beginning and deleting
      // the final value in the RLE
      rle.end--;
      if (rle.start >= rle.end) {
        // Last value in the RLE
        row.splice(rleIndex, 1);
        if (!row.length) {
          this.rows.delete(j);
        }
      }
      return;
    }
    if (rle.start === i) {
      // Not the only value, otherwise this is checked by the previous code
      rle.start++;
      return;
    }
    // Need to split the rle since the value occurs in the middle.
    const newRle = {
      value: rle.value,
      start: i + 1,
      end: rle.end,
    };
    rle.end = i;
    row.splice(rleIndex + 1, 0, newRle);
  }

  /**
   * Finds the index in the row that i is contained in, OR that i would be
   * before.   That is, the rle value for the returned index in that row
   * has `i ε [start,end)` if a direct RLE is found, or `i ε [end_-1,start)` if
   * in the prefix.  If no RLE is found with that index, then
   * `i ε [end_final,length)`
   */
  protected findIndex(row: RLERun<T>[], i: number) {
    for (let index = 0; index < row.length; index++) {
      const { end: iEnd } = row[index];
      if (i < iEnd) {
        return index;
      }
    }
    return row.length;
  }

  /**
   * For each RLE element, call the given callback
   */
  public forEach(callback, options?: { rowModified?: boolean }) {
    const rowModified = options?.rowModified;
    for (const [baseIndex, row] of this.rows) {
      const rowToUse = rowModified ? [...row] : row;
      for (const rle of rowToUse) {
        callback(baseIndex * this.width, rle, row);
      }
    }
  }

  /**
   * For each row, call the callback with the base index and the row data
   */
  public forEachRow(callback) {
    for (const [baseIndex, row] of this.rows) {
      callback(baseIndex * this.width, row);
    }
  }

  /**
   * Gets the run for the given j,k indices.  This is used to allow fast access
   * to runs for data for things like rendering entire rows of data.
   */
  public getRun = (j: number, k: number) => {
    const runIndex = j + k * this.height;
    return this.rows.get(runIndex);
  };

  /**
   * Adds to the RLE at the given position.  This is unfortunately fairly
   * complex since it is desirable to minimize the number of runs, but to still
   * allow it to be efficient.
   */
  public set = (index: number, value: T) => {
    if (value === undefined) {
      // Don't store undefined values
      return;
    }
    const i = index % this.width;
    const j = (index - i) / this.width;
    const row = this.rows.get(j);
    if (!row) {
      this.rows.set(j, [{ start: i, end: i + 1, value }]);
      return;
    }
    const rleIndex = this.findIndex(row, i);
    const rle1 = row[rleIndex];
    const rle0 = row[rleIndex - 1];

    // Adding to the end of the row
    if (!rle1) {
      // We are at the end, check if the previous rle can be extended
      if (!rle0 || rle0.value !== value || rle0.end !== i) {
        row[rleIndex] = { start: i, end: i + 1, value };
        // validateRow(row, i, rleIndex, value);
        return;
      }
      // Just add it to the previous element.
      rle0.end++;
      return;
    }

    const { start, end, value: oldValue } = rle1;

    // Handle the already in place case
    if (value === oldValue && i >= start) {
      // validateRow(row, i, rleIndex, value, start);
      return;
    }

    const rleInsert = { start: i, end: i + 1, value };
    const isAfter = i > start;
    const insertIndex = isAfter ? rleIndex + 1 : rleIndex;
    const rlePrev = isAfter ? rle1 : rle0;
    let rleNext = isAfter ? row[rleIndex + 1] : rle1;

    // Can merge with previous value, so no insert
    if (rlePrev?.value === value && rlePrev?.end === i) {
      rlePrev.end++;
      if (rleNext?.value === value && rleNext.start === i + 1) {
        rlePrev.end = rleNext.end;
        row.splice(rleIndex, 1);
        // validateRow(row, i, rleIndex, value);
      } else if (rleNext?.start === i) {
        rleNext.start++;
        if (rleNext.start === rleNext.end) {
          row.splice(rleIndex, 1);
          rleNext = row[rleIndex];
          // Check if we can merge twice
          if (rleNext?.start === i + 1 && rleNext.value === value) {
            rlePrev.end = rleNext.end;
            row.splice(rleIndex, 1);
          }
        }
        // validateRow(row, i, rleIndex, value);
      }
      return;
    }

    // Can merge with next, so no insert
    if (rleNext?.value === value && rleNext.start === i + 1) {
      rleNext.start--;
      if (rlePrev?.end > i) {
        rlePrev.end = i;
        if (rlePrev.end === rlePrev.start) {
          row.splice(rleIndex, 1);
        }
      }
      // validateRow(row, i, rleIndex, value);
      return;
    }

    // Can't merge, need to see if we can replace
    if (rleNext?.start === i && rleNext.end === i + 1) {
      rleNext.value = value;
      const nextnext = row[rleIndex + 1];
      if (nextnext?.start == i + 1 && nextnext.value === value) {
        row.splice(rleIndex + 1, 1);
        rleNext.end = nextnext.end;
      }
      // validateRow(row, i, rleIndex, value);
      return;
    }

    // Need to fix the next start value
    if (i === rleNext?.start) {
      rleNext.start++;
    }
    if (isAfter && end > i + 1) {
      // Insert two items, to split the existing into three
      row.splice(insertIndex, 0, rleInsert, {
        start: i + 1,
        end: rlePrev.end,
        value: rlePrev.value,
      });
    } else {
      row.splice(insertIndex, 0, rleInsert);
    }
    if (rlePrev?.end > i) {
      rlePrev.end = i;
    }
    // validateRow(row, i, rleIndex, value, insertIndex);
  };

  /**
   * Clears all entries.
   */
  public clear() {
    this.rows.clear();
  }

  /**
   * Gets the set of key entries - that is j values.  This may include
   * `j>=height`, where `j = key % height`, and `k = Math.floor(j / height)`
   */
  public keys(): number[] {
    return [...this.rows.keys()];
  }

  /**
   * Gets the pixel data into the provided pixel data array, or creates one
   * according to the assigned type.
   */
  public getPixelData(
    k = 0,
    pixelData?: PixelDataTypedArray
  ): PixelDataTypedArray {
    if (!pixelData) {
      pixelData = new this.pixelDataConstructor(
        this.width * this.height * this.numComps
      );
    } else {
      pixelData.fill(0);
    }
    const { width, height, numComps } = this;

    for (let j = 0; j < height; j++) {
      const row = this.getRun(j, k);
      if (!row) {
        continue;
      }
      if (numComps === 1) {
        for (const rle of row) {
          const rowOffset = j * width;
          const { start, end, value } = rle;
          for (let i = start; i < end; i++) {
            pixelData[rowOffset + i] = value as unknown as number;
          }
        }
      } else {
        for (const rle of row) {
          const rowOffset = j * width * numComps;
          const { start, end, value } = rle;
          for (let i = start; i < end; i += numComps) {
            for (let comp = 0; comp < numComps; comp++) {
              pixelData[rowOffset + i + comp] = value[comp];
            }
          }
        }
      }
    }
    return pixelData;
  }

  /**
   * Performs a flood fill on the RLE values at the given position, replacing
   * the current value with the new value (which must be different)
   * Note that this is, by default, a planar fill, which will fill each plane
   * given the starting point, in a true flood fill fashion, but then not
   * re-fill the given plane.
   *
   * @param i,j,k - starting point to fill from, as integer indices into
   * the voxel volume.  These are converted internally to RLE indices
   * @param value - to replace the existing value with.  Must be different from
   *   the starting value.
   * @param options - to control the flood.
   *       * planar means to flood the current k plane entirely, and then use the
   *         points from the current plane as seed points in the k+1 and k-1 planes,
   *         but not returning to the current plane
   *       * singlePlane is just a single k plane, not filling any other planes
   *       * diagonals means to use the diagonally adjacent points.
   */
  public floodFill(
    i: number,
    j: number,
    k: number,
    value: T,
    options?: { planar?: boolean; diagonals?: boolean; singlePlane?: boolean }
  ): number {
    const rle = this.getRLE(i, j, k);
    if (!rle) {
      throw new Error(`Initial point ${i},${j},${k} isn't in the RLE`);
    }
    const stack = [[rle, j, k]];
    const replaceValue = rle.value;
    if (replaceValue === value) {
      throw new Error(
        `source (${replaceValue}) and destination (${value}) are identical`
      );
    }
    return this.flood(stack, replaceValue, value, options);
  }

  /**
   * Performs a flood fill on the stack.
   *
   * @param stack - list of points/rle runs to try filling
   * @param sourceValue - the value that is being replaced in the flood
   * @param value - the destination value for the flood
   * @param options - see floodFill
   */
  private flood(stack, sourceValue, value, options) {
    let sum = 0;
    const {
      planar = true,
      diagonals = true,
      singlePlane = false,
    } = options || {};
    const childOptions = { planar, diagonals, singlePlane };
    while (stack.length) {
      const top = stack.pop();
      const [current] = top;
      if (current.value !== sourceValue) {
        continue;
      }
      current.value = value;
      sum += current.end - current.start;
      const adjacents = this.findAdjacents(top, childOptions).filter(
        (adjacent) => adjacent && adjacent[0].value === sourceValue
      );
      stack.push(...adjacents);
    }
    return sum;
  }

  /**
   * Fills an RLE from a given getter result, skipping undefined values only.
   * @param getter - a function taking i,j,k values (indices) and returning the new
   *       value at the given point.
   * @param boundsIJK - a set of boundary values to flood up to and including both values.
   */
  public fillFrom(
    getter: (i: number, j: number, k: number) => T,
    boundsIJK: BoundsIJK
  ) {
    for (let k = boundsIJK[2][0]; k <= boundsIJK[2][1]; k++) {
      for (let j = boundsIJK[1][0]; j <= boundsIJK[1][1]; j++) {
        let rle;
        let row;
        for (let i = boundsIJK[0][0]; i <= boundsIJK[0][1]; i++) {
          const value = getter(i, j, k);
          if (value === undefined) {
            rle = undefined;
            continue;
          }
          if (!row) {
            row = [];
            this.rows.set(j + k * this.height, row);
          }
          if (rle && rle.value !== value) {
            rle = undefined;
          }
          if (!rle) {
            rle = { start: i, end: i, value };
            row.push(rle);
          }
          rle.end++;
        }
      }
    }
  }

  /**
   * Finds adjacent RLE runs, in all directions.
   * The planar value (true by default) does plane at a time fills.
   * @param item - an RLE being sepecified to find adjacent values for
   * @param options - see floodFill
   */
  public findAdjacents(
    item: [RLERun<T>, number, number, Point3[]?],
    { diagonals = true, planar = true, singlePlane = false }
  ) {
    const [rle, j, k, adjacentsDelta] = item;
    const { start, end } = rle;
    const leftRle = start > 0 && this.getRLE(start - 1, j, k);
    const rightRle = end < this.width && this.getRLE(end, j, k);
    const range = diagonals
      ? [start > 0 ? start - 1 : start, end < this.width ? end + 1 : end]
      : [start, end];
    const adjacents = [];
    if (leftRle) {
      adjacents.push([leftRle, j, k]);
    }
    if (rightRle) {
      adjacents.push([rightRle, j, k]);
    }
    for (const delta of adjacentsDelta ||
      (singlePlane ? ADJACENT_SINGLE_PLANE : ADJACENT_ALL)) {
      const [, delta1, delta2] = delta;
      const testJ = delta1 + j;
      const testK = delta2 + k;
      if (testJ < 0 || testJ >= this.height) {
        continue;
      }
      if (testK < 0 || testK >= this.depth) {
        continue;
      }
      const row = this.getRun(testJ, testK);
      if (!row) {
        continue;
      }
      for (const testRle of row) {
        const newAdjacentDelta =
          adjacentsDelta ||
          (singlePlane && ADJACENT_SINGLE_PLANE) ||
          (planar && delta2 > 0 && ADJACENT_OUT) ||
          (planar && delta2 < 0 && ADJACENT_IN) ||
          ADJACENT_ALL;
        if (!(testRle.end <= range[0] || testRle.start >= range[1])) {
          adjacents.push([testRle, testJ, testK, newAdjacentDelta]);
        }
      }
    }
    return adjacents;
  }
}

// This is some code to allow debugging RLE maps
// To be deleted along with references once RLE is better tested.
// Might move to testing code at that point
// function validateRow(row, ...inputs) {
//   if (!row) {
//     return;
//   }
//   let lastRle;
//   for (const rle of row) {
//     const { start, end, value } = rle;
//     if (start < 0 || end > 1920 || start >= end) {
//       console.log('Wrong order', ...inputs);
//     }
//     if (!lastRle) {
//       lastRle = rle;
//       continue;
//     }
//     const { start: lastStart, end: lastEnd, value: lastValue } = lastRle;
//     lastRle = rle;
//     if (start < lastEnd) {
//       console.log('inputs for wrong overlap', ...inputs);
//     }
//     if (start === lastEnd && value === lastValue) {
//       console.log('inputs for two in a row same', ...inputs);
//     }
//   }
// }
