import isEqual from './isEqual';

export type RLERun<T> = {
  value: T;
  i: number;
  iEnd: number;
  run: RLERun<T>;
};

export type RLERow<T> = {
  run: RLERun<T>;
  j: number;
};

export type RLEPlane<T> = {
  rows: Map<number, RLERow<T>>;
  k: number;
};

/**
 * RLE based run of values
 */
export default class RLEVoxelMap<T> {
  protected planes = new Map<number, RLEPlane<T>>();
  protected height = 1;
  protected width = 1;
  protected depth = 1;
  protected jMultiple;
  protected kMultiple;

  constructor(width: number, height: number, depth: number) {
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.jMultiple = width;
    this.kMultiple = width * height;
  }

  /**
   * Returns an RLE run containing the start/end and the next sequence.
   *
   * @param k - index (eg the plane)
   * @param j - index (eg the row)
   */
  public getRun(k: number, j: number): RLERow<T> {
    const plane = this.planes.get(k);
    if (!plane) {
      return;
    }
    const row = plane.rows.get(j);
    return row;
  }

  public get = (index): T => {
    const k = Math.floor(index / this.kMultiple);
    const plane = this.planes.get(k);
    if (!plane) {
      return;
    }
    const i = index % this.jMultiple;
    const j = (index - k * this.kMultiple - i) / this.jMultiple;
    const row = plane.rows.get(j);
    if (!row) {
      return;
    }
    for (let run = row.run; run; run = run.run) {
      if (i >= run.i && i < run.iEnd) {
        return run.value;
      }
    }
    return;
  };

  public set = (index, value: T) => {
    const k = Math.floor(index / this.kMultiple);
    let plane = this.planes.get(k);
    const isDefault = !value;
    if (!plane) {
      if (isDefault) {
        return;
      }
      plane = {
        rows: new Map(),
        k,
      };
      this.planes.set(k, plane);
    }
    const i = index % this.jMultiple;
    const j = (index - k * this.kMultiple - i) / this.jMultiple;
    let row = plane.rows.get(j);
    if (!row) {
      row = {
        run: null,
        j,
      };
      plane.rows.set(j, row);
    }
    if (!row.run) {
      if (isDefault) {
        return;
      }
      row.run = {
        value,
        i,
        iEnd: i + 1,
        run: null,
      };
      return;
    }
    let lastRun = row as unknown as RLERun<T>;
    for (let run = row.run; run; run = run.run) {
      if (i < run.i) {
        if (!isDefault) {
          lastRun.run = {
            run,
            i,
            iEnd: i + 1,
            value,
          };
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
        this.optimizeRow(row);
        return;
      }
      lastRun = run;
    }
    if (isDefault) {
      return;
    }
    lastRun.run = {
      run: null,
      i,
      iEnd: i + 1,
      value,
    };
    this.optimizeRow(row);
  };

  protected optimizeRow(row: RLERow<T>) {
    let { run } = row;
    // Cast this through unknown so that we can pretend it is a run
    let lastRun = row as unknown as RLERun<T>;
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
  }

  public clear() {
    this.planes.clear();
  }

  public keys(): number[] {
    throw new Error('TODO - implement this');
  }
}
