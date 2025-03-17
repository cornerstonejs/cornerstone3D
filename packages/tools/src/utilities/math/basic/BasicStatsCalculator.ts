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
  m3: number[]; // For skewness calculation
  m4: number[]; // For kurtosis calculation
  allValues: number[][]; // Store all values for median calculation
  pointsInShape?: Types.IPointsManager<Types.Point3> | null;
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
    m3: [0],
    m4: [0],
    allValues: [[]],
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
    state.m3.push(state.m3[0], state.m3[0]);
    state.m4.push(state.m4[0], state.m4[0]);
    state.allValues.push([], []);
  }

  if (state?.pointsInShape && pointLPS) {
    state.pointsInShape.push(pointLPS);
  }
  const newArray = Array.isArray(newValue) ? newValue : [newValue];
  state.count += 1;
  state.max.forEach((it, idx) => {
    const value = newArray[idx];

    // Store value for median calculation
    state.allValues[idx].push(value);

    // Calculate running statistics using Welford's online algorithm
    // extended for higher moments (skewness and kurtosis)
    const n = state.count;
    const delta = value - state.runMean[idx];
    const delta_n = delta / n;
    const term1 = delta * delta_n * (n - 1);

    // Update mean
    state.sum[idx] += value;
    state.runMean[idx] += delta_n;

    // For kurtosis, must be updated before m3 and m2
    state.m4[idx] +=
      term1 * delta_n * delta_n * (n * n - 3 * n + 3) +
      6 * delta_n * delta_n * state.m2[idx] -
      4 * delta_n * state.m3[idx];

    // For skewness, must be updated before m2
    state.m3[idx] += term1 * delta_n * (n - 2) - 3 * delta_n * state.m2[idx];

    // For variance
    state.m2[idx] += term1;

    if (value < state.min[idx]) {
      state.min[idx] = value;
      if (idx === 0) {
        state.minIJK = pointIJK ? [...pointIJK] : null;
        state.minLPS = pointLPS ? [...pointLPS] : null;
      }
    }

    if (value > state.max[idx]) {
      state.max[idx] = value;
      if (idx === 0) {
        state.maxIJK = pointIJK ? [...pointIJK] : null;
        state.maxLPS = pointLPS ? [...pointLPS] : null;
      }
    }
  });
}

// Helper function to calculate median
function calculateMedian(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  // Sort values
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    return sorted[mid];
  }
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

  // Calculate skewness
  const skewness = state.m3.map((m3, idx) => {
    const variance = state.m2[idx] / state.count;
    if (variance === 0) {
      return 0;
    }
    return m3 / (state.count * Math.pow(variance, 1.5));
  });

  // Calculate kurtosis (excess kurtosis: normal distribution would be 0)
  const kurtosis = state.m4.map((m4, idx) => {
    const variance = state.m2[idx] / state.count;
    if (variance === 0) {
      return 0;
    }
    return m4 / (state.count * variance * variance) - 3;
  });

  // Calculate median for each channel
  const median = state.allValues.map((values) => calculateMedian(values));

  const named: NamedStatistics = {
    max: {
      name: 'max',
      label: 'Max Pixel',
      value: state.max.length === 1 ? state.max[0] : state.max,
      unit,
      pointIJK: state.maxIJK ? [...state.maxIJK] : null,
      pointLPS: state.maxLPS ? [...state.maxLPS] : null,
    },
    min: {
      name: 'min',
      label: 'Min Pixel',
      value: state.min.length === 1 ? state.min[0] : state.min,
      unit,
      pointIJK: state.minIJK ? [...state.minIJK] : null,
      pointLPS: state.minLPS ? [...state.minLPS] : null,
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
      label: 'Voxel Count',
      value: state.count,
      unit: null,
    },
    median: {
      name: 'median',
      label: 'Median',
      value: median.length === 1 ? median[0] : median,
      unit,
    },
    skewness: {
      name: 'skewness',
      label: 'Skewness',
      value: skewness.length === 1 ? skewness[0] : skewness,
      unit: null,
    },
    kurtosis: {
      name: 'kurtosis',
      label: 'Kurtosis',
      value: kurtosis.length === 1 ? kurtosis[0] : kurtosis,
      unit: null,
    },
    maxLPS: {
      name: 'maxLPS',
      label: 'Max LPS',
      value: state.maxLPS ? Array.from(state.maxLPS) : null,
      unit: null,
    },
    minLPS: {
      name: 'minLPS',
      label: 'Min LPS',
      value: state.minLPS ? Array.from(state.minLPS) : null,
      unit: null,
    },
    pointsInShape: state.pointsInShape,
    array: [],
  };
  named.array.push(
    named.min,
    named.max,
    named.mean,
    named.stdDev,
    named.median,
    named.skewness,
    named.kurtosis,
    named.count,
    named.maxLPS,
    named.minLPS
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
  state.m3 = freshState.m3;
  state.m4 = freshState.m4;
  state.allValues = freshState.allValues;
  state.pointsInShape = freshState.pointsInShape;

  return named;
}

/**
 * A static basic stats calculator that uses shared helper functions.
 */
export class BasicStatsCalculator extends Calculator {
  private static state: BasicStatsState = createBasicStatsState(true);

  public static statsInit(options: { storePointData: boolean }): void {
    if (!options.storePointData) {
      this.state.pointsInShape = null;
    }
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

  constructor(options: { storePointData: boolean }) {
    super(options);
    this.state = createBasicStatsState(options.storePointData);
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
   * @param data The data object containing value and optional points
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
   * @param options Optional parameters including unit
   * @returns The computed statistics
   */
  getStatistics(options?: {
    unit: string;
    spacing?: number[] | number;
  }): NamedStatistics {
    return basicGetStatistics(this.state, options?.unit);
  }
}
