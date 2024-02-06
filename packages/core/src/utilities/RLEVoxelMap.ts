import isEqual from './isEqual';

export type RLERun<T> = {
  value: T;
  i: number;
  iEnd: number;
};

/**
 * RLE based implementation of a voxel map.
 * This can be used as single or multi-plane, as the underlying indexes are
 * mapped to rows and hte rows are indexed started at 0 and continuing
 * incrementing for all rows in the multi-plane voxel.
 */
export default class RLEVoxelMap<T> {
  protected rows = new Map<number, RLERun<T>[]>();
  protected height = 1;
  protected width = 1;
  protected depth = 1;
  protected jMultiple = 1;
  protected kMultiple = 1;

  constructor(width: number, height: number, depth = 1) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.jMultiple = width;
    this.kMultiple = this.jMultiple * height;
  }

  public get = (index): T => {
    const i = index % this.jMultiple;
    const j = (index - i) / this.jMultiple;
    const rle = this.getRLE(i, j);
    return rle?.value;
  };

  protected getRLE(i: number, j: number): RLERun<T> {
    const row = this.rows.get(j);
    if (!row) {
      return;
    }
    const index = this.findIndex(row, i);
    const rle = row[index];
    return i >= rle?.i ? rle : undefined;
  }

  protected findIndex(row: RLERun<T>[], i: number) {
    for (let index = 0; index < row.length; index++) {
      const { iEnd } = row[index];
      if (i < iEnd) {
        return index;
      }
    }
    return row.length;
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
    const isDefault = !value;
    const i = index % this.width;
    const j = (index - i) / this.width;
    const row = this.rows.get(j);
    if (!row) {
      if (isDefault) {
        return;
      }
      this.rows.set(j, [{ i, iEnd: i + 1, value }]);
      return;
    }
    const rleIndex = this.findIndex(row, i);
    const rle = row[rleIndex];
    const rleLast = row[rleIndex - 1];
    if (!rle) {
      // We are at the end, check if the previous rle can be extended
      if (!rleLast || rleLast.value !== value || rleLast.iEnd !== i) {
        row[rleIndex] = { i, iEnd: i + 1, value };
        return;
      }
      // Just add it to the previous element.
      rleLast.iEnd++;
      return;
    }
    if (value === rle.value) {
      if (i >= rle.i) {
        return;
      }
      if (i === rle.i - 1) {
        rle.i--;
        if (!rleLast || rleLast.iEnd < i || rleLast.value !== value) {
          return;
        }
        rle.i = rleLast.i;
        row.splice(rleIndex, 1);
        return;
      }
    }
    // Value is not the same
    if (i > rle.i) {
      // Split after rle
      row.splice(rleIndex, 0, { i, iEnd: i + 1, value });
      return;
    }
    if (i === rle.i) {
      if (rle.iEnd === i + 1) {
        rle.value = value;
        return;
      }
      rle.i++;
    }
    row.splice(rleIndex - 1, 0, { i, iEnd: i + 1, value });
  };

  public clear() {
    this.rows.clear();
  }

  public keys(): number[] {
    throw new Error('TODO - implement this');
  }
}
