import isEqual from './isEqual';

export type RLERun<T> = {
  value: T;
  i: number;
  iEnd: number;
  run: RLERun<T>;
};

/**
 * RLE based implementation of a voxel map.
 * This can be used as single or multi-plane, as the underlying indexes are
 * mapped to rows and hte rows are indexed started at 0 and continuing
 * incrementing for all rows in the multi-plane voxel.
 */
export default class RLEVoxelMap<T> {
  protected rows = new Map<number, RLERun<T>>();
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
    const row = this.rows.get(j);
    if (!row) {
      return;
    }
    for (let run = row; run; run = run.run) {
      if (i >= run.i && i < run.iEnd) {
        return run.value;
      }
    }
    return;
  };

  public getRun = (j: number, k: number) => {
    const runIndex = j + k * this.height;
    return this.rows.get(runIndex);
  };

  public set = (index, value: T) => {
    const isDefault = !value;
    const i = index % this.jMultiple;
    const j = (index - i) / this.jMultiple;
    const row = this.rows.get(j);
    const newRun = {
      run: null,
      i,
      iEnd: i + 1,
      value,
    };
    if (!row) {
      if (isDefault) {
        return;
      }
      this.rows.set(j, newRun);
      return;
    }
    let lastRun;
    for (let run = row; run; run = run.run) {
      if (i < run.i) {
        if (!isDefault) {
          newRun.run = run;
          if (lastRun) {
            lastRun.run = newRun;
          } else {
            this.rows.set(j, newRun);
          }
        }
        return;
      }
      if (i >= run.i && i < run.iEnd) {
        if (isEqual(value, run.value)) {
          return;
        }
        run.run = {
          run: run.run,
          i,
          iEnd: i + 1,
          value,
        };
        run.iEnd = i;
        this.optimizeRow(row, j);
        return;
      }
      lastRun = run;
    }
    if (isDefault) {
      return;
    }
    lastRun.run = newRun;
    this.optimizeRow(row, j);
  };

  protected optimizeRow(row: RLERun<T>, j: number) {
    let run = row;
    const firstRow = { run, i: -Infinity, iEnd: -Infinity, value: null };
    let lastRun = firstRow;

    // Cast this through unknown so that we can pretend it is a run
    while (run) {
      if (!run.value) {
        // Delete the run since it isn't needed
        lastRun.run = run.run;
        run = run.run;
        continue;
      }
      if (lastRun.iEnd >= run.i) {
        if (isEqual(lastRun.value, run.value)) {
          lastRun.iEnd = run.iEnd;
          // Deletes the run, incorporating it into lastRun
          lastRun.run = run.run;
          run = run.run;
          continue;
        }
        run.i = lastRun.iEnd;
        if (run.i >= run.iEnd) {
          // This run is gone, so remove it
          lastRun.run = run.run;
          run = run.run;
          continue;
        }
        // The run is shortened, but not gone, so leave it.
      }
      lastRun = run;
      run = run.run;
    }
    if (!firstRow.run) {
      this.rows.delete(j);
    } else {
      this.rows.set(j, firstRow.run);
    }
  }

  public clear() {
    this.rows.clear();
  }

  public keys(): number[] {
    throw new Error('TODO - implement this');
  }
}
