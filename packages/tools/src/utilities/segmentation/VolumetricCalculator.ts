import type { Types } from '@cornerstonejs/core';
import type { NamedStatistics } from '../../types';
import {
  BasicStatsCalculator,
  InstanceBasicStatsCalculator,
} from '../math/basic/BasicStatsCalculator';
import { getCalibratedLengthUnitsAndScale } from '../getCalibratedUnits';

const TEST_MAX_LOCATIONS = 10;

interface VolumetricState {
  maxIJKs: Array<{
    value: number;
    pointLPS?: Types.Point3;
    pointIJK?: Types.Point3;
  }>;
}

function createVolumetricState(): VolumetricState {
  return {
    maxIJKs: [],
  };
}

function volumetricStatsCallback(
  state: VolumetricState,
  data: {
    value: number | Types.RGB;
    pointLPS?: Types.Point3;
    pointIJK?: Types.Point3;
  }
): void {
  const { value } = data;
  const { maxIJKs } = state;
  const length = maxIJKs.length;

  if (
    typeof value !== 'number' ||
    (length >= TEST_MAX_LOCATIONS && value < maxIJKs[0].value)
  ) {
    return;
  }

  // Create a deep copy of the data object to prevent reference issues
  const dataCopy = {
    value: data.value as number,
    pointLPS: data.pointLPS
      ? ([data.pointLPS[0], data.pointLPS[1], data.pointLPS[2]] as Types.Point3)
      : undefined,
    pointIJK: data.pointIJK
      ? ([data.pointIJK[0], data.pointIJK[1], data.pointIJK[2]] as Types.Point3)
      : undefined,
  };

  if (!length || value >= maxIJKs[length - 1].value) {
    maxIJKs.push(dataCopy);
  } else {
    for (let i = 0; i < length; i++) {
      if (value <= maxIJKs[i].value) {
        maxIJKs.splice(i, 0, dataCopy);
        break;
      }
    }
  }

  if (length >= TEST_MAX_LOCATIONS) {
    maxIJKs.splice(0, 1);
  }
}

function volumetricGetStatistics(
  state: VolumetricState,
  stats: NamedStatistics,
  options: {
    spacing?: number[] | number;
    calibration?: unknown;
    hasPixelSpacing?: boolean;
    unit?: string;
  }
): NamedStatistics {
  const { spacing, calibration } = options;
  const { volumeUnit } = getCalibratedLengthUnitsAndScale(
    // Todo: fix this for volumes; we don't have calibration for volumes yet
    // Also, if there is a volume, there should be spacing, so it is always true
    {
      calibration,
      hasPixelSpacing: true,
    },
    []
  );
  const volumeScale = spacing ? spacing[0] * spacing[1] * spacing[2] * 1000 : 1;

  stats.volume = {
    value: Array.isArray(stats.count.value)
      ? stats.count.value.map((v: number) => v * volumeScale)
      : stats.count.value * volumeScale,
    unit: volumeUnit,
    name: 'volume',
    label: 'Volume',
  };

  stats.maxIJKs = state.maxIJKs.filter(
    (entry): entry is { value: number; pointIJK: Types.Point3 } =>
      entry.pointIJK !== undefined
  );
  stats.array.push(stats.volume);

  // Reset state
  state.maxIJKs = [];

  return stats;
}

/**
 * A basic stats calculator for volumetric data, generally for use with segmentations.
 */
export class VolumetricCalculator extends BasicStatsCalculator {
  private static volumetricState: VolumetricState = createVolumetricState();

  public static statsInit(options: { storePointData: boolean }): void {
    super.statsInit(options);
    this.volumetricState = createVolumetricState();
  }

  public static statsCallback(data: {
    value: number | Types.RGB;
    pointLPS?: Types.Point3;
    pointIJK?: Types.Point3;
  }): void {
    super.statsCallback(data);
    volumetricStatsCallback(this.volumetricState, data);
  }

  public static getStatistics(options: {
    spacing?: number[] | number;
    unit?: string;
    calibration?: unknown;
    hasPixelSpacing?: boolean;
  }): NamedStatistics {
    const optionsWithUnit = {
      ...options,
      unit: options?.unit || 'none',
      calibration: options?.calibration,
      hasPixelSpacing: options?.hasPixelSpacing,
    };
    const stats = super.getStatistics(optionsWithUnit);
    return volumetricGetStatistics(
      this.volumetricState,
      stats,
      optionsWithUnit
    );
  }
}

/**
 * An instantiable version of VolumetricCalculator that uses instance state.
 */
export class InstanceVolumetricCalculator extends InstanceBasicStatsCalculator {
  private volumetricState: VolumetricState;

  constructor(options: { storePointData: boolean }) {
    super(options);
    this.volumetricState = createVolumetricState();
  }

  statsInit(options: { storePointData: boolean }): void {
    super.statsInit(options);
    this.volumetricState = createVolumetricState();
  }

  statsCallback(data: {
    value: number | Types.RGB;
    pointLPS?: Types.Point3;
    pointIJK?: Types.Point3;
  }): void {
    super.statsCallback(data);
    volumetricStatsCallback(this.volumetricState, data);
  }

  getStatistics(options?: {
    spacing?: number[] | number;
    unit?: string;
    calibration?: unknown;
    hasPixelSpacing?: boolean;
  }): NamedStatistics {
    const optionsWithUnit = {
      ...options,
      unit: options?.unit || 'none',
      calibration: options?.calibration,
      hasPixelSpacing: options?.hasPixelSpacing,
    };
    const stats = super.getStatistics(optionsWithUnit);
    return volumetricGetStatistics(
      this.volumetricState,
      stats,
      optionsWithUnit
    );
  }
}

export default VolumetricCalculator;
