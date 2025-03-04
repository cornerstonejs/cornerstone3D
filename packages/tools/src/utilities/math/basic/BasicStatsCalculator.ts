import { utilities } from '@cornerstonejs/core';
import type { NamedStatistics } from '../../../types';
import { Calculator, InstanceCalculator } from './Calculator';
import type { Types } from '@cornerstonejs/core';

const { PointsManager } = utilities;

// Define an interface for the internal state used by the basic stats calculators
interface BasicStatsState {
  max: number[];
  min: number[];
  sum: number[];
  count: number;
  maxIJK: Types.Point3 | null;
  maxLPS: Types.Point3 | null;
  minIJK: Types.Point3 | null;
  minLPS: Types.Point3 | null;
  runMean: number[];
  m2: number[];
  pointsInShape: Types.IPointsManager<Types.Point3> | null;
}

// Helper function to create a new state
function createBasicStatsState(storePointData: boolean): BasicStatsState {
  return {
    max: [-Infinity],
    min: [Infinity],
    sum: [0],
    count: 0,
    maxIJK: null,
    maxLPS: null,
    minIJK: null,
    minLPS: null,
    runMean: [0],
    m2: [0],
    pointsInShape: storePointData ? PointsManager.create3(1024) : null,
  };
}

// Shared logic for updating stats from a callback
function basicStatsCallback(
  state: BasicStatsState,
  newValue: number | Types.RGB,
  pointLPS: Types.Point3 | null = null,
  pointIJK: Types.Point3 | null = null
): void {
  if (
    Array.isArray(newValue) &&
    newValue.length > 1 &&
    state.max.length === 1
  ) {
    state.max.push(state.max[0], state.max[0]);
    state.min.push(state.min[0], state.min[0]);
    state.sum.push(state.sum[0], state.sum[0]);
    state.runMean.push(0, 0);
    state.m2.push(state.m2[0], state.m2[0]);
  }

  if (state.pointsInShape && pointLPS) {
    state.pointsInShape.push(pointLPS);
  }
  const newArray = Array.isArray(newValue) ? newValue : [newValue];

  state.count += 1;
  state.max.forEach((it, idx) => {
    const value = newArray[idx];
    const delta = value - state.runMean[idx];
    state.sum[idx] += value;
    state.runMean[idx] += delta / state.count;
    const delta2 = value - state.runMean[idx];
    state.m2[idx] += delta * delta2;

    state.min[idx] = Math.min(state.min[idx], value);
    if (value < state.min[idx]) {
      state.min[idx] = value;
      if (idx === 0) {
        state.minIJK = pointIJK;
        state.minLPS = pointLPS;
      }
    }

    if (value > state.max[idx]) {
      state.max[idx] = value;
      if (idx === 0) {
        state.maxIJK = pointIJK;
        state.maxLPS = pointLPS;
      }
    }
  });
}

// Shared logic for computing the statistics
function basicGetStatistics(
  state: BasicStatsState,
  unit?: string
): NamedStatistics {
  const mean = state.sum.map((sum) => sum / state.count);
  const stdDev = state.m2.map((squaredDiffSum) =>
    Math.sqrt(squaredDiffSum / state.count)
  );

  const named: NamedStatistics = {
    max: {
      name: 'max',
      label: 'Max Pixel',
      value: state.max.length === 1 ? state.max[0] : state.max,
      unit,
      pointIJK: state.maxIJK,
      pointLPS: state.maxLPS,
    },
    min: {
      name: 'min',
      label: 'Min Pixel',
      value: state.min.length === 1 ? state.min[0] : state.min,
      unit,
      pointIJK: state.minIJK,
      pointLPS: state.minLPS,
    },
    mean: {
      name: 'mean',
      label: 'Mean Pixel',
      value: mean.length === 1 ? mean[0] : mean,
      unit,
    },
    stdDev: {
      name: 'stdDev',
      label: 'Standard Deviation',
      value: stdDev.length === 1 ? stdDev[0] : stdDev,
      unit,
    },
    count: {
      name: 'count',
      label: 'Pixel Count',
      value: state.count,
      unit: null,
    },
    pointsInShape: state.pointsInShape,
    array: [],
  };
  named.array.push(
    named.max,
    named.mean,
    named.stdDev,
    named.stdDev,
    named.count
  );

  // Reset state for next computation
  const store = state.pointsInShape !== null;
  const freshState = createBasicStatsState(store);
  // Copy fresh state into the provided state object
  state.max = freshState.max;
  state.min = freshState.min;
  state.sum = freshState.sum;
  state.count = freshState.count;
  state.maxIJK = freshState.maxIJK;
  state.maxLPS = freshState.maxLPS;
  state.minIJK = freshState.minIJK;
  state.minLPS = freshState.minLPS;
  state.runMean = freshState.runMean;
  state.m2 = freshState.m2;
  state.pointsInShape = freshState.pointsInShape;

  return named;
}

/**
 * A static basic stats calculator that uses shared helper functions.
 */
export class BasicStatsCalculator extends Calculator {
  private static state: BasicStatsState = createBasicStatsState(true);

  public static statsInit(options: { storePointData: boolean }): void {
    this.state = createBasicStatsState(options.storePointData);
  }

  public static statsCallback = ({
    value: newValue,
    pointLPS = null,
    pointIJK = null,
  }: {
    value: number | Types.RGB;
    pointLPS?: Types.Point3 | null;
    pointIJK?: Types.Point3 | null;
  }): void => {
    basicStatsCallback(this.state, newValue, pointLPS, pointIJK);
  };

  public static getStatistics = (options?: {
    unit: string;
  }): NamedStatistics => {
    return basicGetStatistics(this.state, options?.unit);
  };
}

/**
 * An instantiable version of BasicStatsCalculator that shares common logic with the static version.
 */
export class InstanceBasicStatsCalculator extends InstanceCalculator {
  private state: BasicStatsState;

  constructor(storePointData: boolean = true) {
    super(storePointData);
    this.state = createBasicStatsState(storePointData);
  }

  /**
   * Resets the internal state.
   * @param options Object with storePointData flag.
   */
  statsInit(options: { storePointData: boolean }): void {
    this.state = createBasicStatsState(options.storePointData);
  }

  /**
   * Processes a new data point for statistics calculation.
   * @param newValue The new value or values to process.
   * @param pointLPS Optional LPS point.
   * @param pointIJK Optional IJK point.
   */
  statsCallback(data: {
    value: number | Types.RGB;
    pointLPS?: Types.Point3 | null;
    pointIJK?: Types.Point3 | null;
  }): void {
    basicStatsCallback(this.state, data.value, data.pointLPS, data.pointIJK);
  }

  /**
   * Computes and returns the statistics based on the accumulated data.
   * @param options Optional parameters including unit.
   * @returns The computed statistics.
   */
  getStatistics(options?: {
    unit: string;
    spacing?: number[] | number;
  }): NamedStatistics {
    return basicGetStatistics(this.state, options?.unit);
  }
}
