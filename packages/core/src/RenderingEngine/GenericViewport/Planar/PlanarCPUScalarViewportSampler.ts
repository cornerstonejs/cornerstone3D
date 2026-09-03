import { InterpolationType } from '../../../enums';
import type { IImageVolume, PixelDataTypedArray, Point3 } from '../../../types';
import {
  getIndexMajorAxis,
  getNearestVoxelIndex,
  getSpatiallyClampedContinuousCoordinate,
  type IndexMajorAxis,
} from './planarCPUVolumeSamplingUtils';

type SliceArray = PixelDataTypedArray;

export type ScalarViewportSampleResult = {
  min: number;
  max: number;
};

type AxisInterpolationPlan = {
  lower: Int32Array;
  upper: Int32Array;
  fraction: Float64Array;
  valid: Uint8Array;
};

type SingleAxisInterpolation = {
  lower: number;
  upper: number;
  fraction: number;
  valid: boolean;
};

type AxisAlignedScalarViewportGeometry = {
  key: string;
  columns: AxisInterpolationPlan;
  rows: AxisInterpolationPlan;
};

const AXIS_ALIGNED_INDEX_DELTA_TOLERANCE = 1e-6;
const AXIS_GEOMETRY_CACHE_SCALE = 1e6;
const MAX_AXIS_GEOMETRY_CACHE_ENTRIES = 8;

function isIndexDeltaOnAxis(
  delta: Point3,
  axis: 0 | 1 | 2,
  tolerance = AXIS_ALIGNED_INDEX_DELTA_TOLERANCE
): boolean {
  for (let indexAxis = 0; indexAxis < 3; indexAxis++) {
    if (indexAxis === axis) {
      continue;
    }

    if (Math.abs(delta[indexAxis]) > tolerance) {
      return false;
    }
  }

  return true;
}

function quantizeGeometryValue(value: number): number {
  return Math.round(value * AXIS_GEOMETRY_CACHE_SCALE);
}

export default class PlanarCPUScalarViewportSampler {
  private completeScalarDataCache = new WeakMap<
    NonNullable<IImageVolume['voxelManager']>,
    ArrayLike<number>
  >();
  private axisAlignedGeometryCache = new WeakMap<
    NonNullable<IImageVolume['voxelManager']>,
    Map<string, AxisAlignedScalarViewportGeometry>
  >();

  public clearCachedVoxelManager(
    voxelManager: NonNullable<IImageVolume['voxelManager']>
  ): void {
    this.completeScalarDataCache.delete(voxelManager);
    this.axisAlignedGeometryCache.delete(voxelManager);
  }

  public getCompleteScalarDataArray(
    voxelManager: NonNullable<IImageVolume['voxelManager']>
  ): ArrayLike<number> | undefined {
    const cachedScalarData = this.completeScalarDataCache.get(voxelManager);

    if (cachedScalarData) {
      return cachedScalarData;
    }

    const scalarData = voxelManager.getCompleteScalarDataArray?.();

    if (!scalarData) {
      return;
    }

    if (scalarData.length) {
      this.completeScalarDataCache.set(voxelManager, scalarData);
    }

    return scalarData;
  }

  public sampleAxisAligned(args: {
    volume: IImageVolume;
    voxelManager: NonNullable<IImageVolume['voxelManager']>;
    pixelData: SliceArray;
    width: number;
    height: number;
    rowStartIndex: Point3;
    xStepIndexDelta: Point3;
    yStepIndexDelta: Point3;
    right: Point3;
    up: Point3;
    normal: Point3;
    interpolationType: InterpolationType;
    numberOfComponents: number;
    fallbackMin: number;
    fallbackMax: number;
  }): ScalarViewportSampleResult | undefined {
    const {
      volume,
      voxelManager,
      pixelData,
      width,
      height,
      rowStartIndex,
      xStepIndexDelta,
      yStepIndexDelta,
      right,
      up,
      normal,
      interpolationType,
      numberOfComponents,
      fallbackMin,
      fallbackMax,
    } = args;

    if (numberOfComponents !== 1 || !voxelManager.getCompleteScalarDataArray) {
      return;
    }

    const normalAxis = getIndexMajorAxis(volume, normal);
    const rightAxis = getIndexMajorAxis(volume, right);
    const upAxis = getIndexMajorAxis(volume, up);

    if (!normalAxis || !rightAxis || !upAxis) {
      return;
    }

    if (
      normalAxis.axis === rightAxis.axis ||
      normalAxis.axis === upAxis.axis ||
      rightAxis.axis === upAxis.axis
    ) {
      return;
    }

    const scalarData = this.getCompleteScalarDataArray(voxelManager);

    if (!scalarData?.length) {
      return;
    }

    const preserveFloatScalarSamples =
      pixelData instanceof Float32Array || pixelData instanceof Float64Array;
    const fixedAxisSample = this.trySampleFixedAxisAligned({
      volume,
      voxelManager,
      scalarData,
      pixelData,
      width,
      height,
      rowStartIndex,
      xStepIndexDelta,
      yStepIndexDelta,
      rightAxis,
      upAxis,
      normalAxis,
      interpolationType,
      fallbackMin,
      fallbackMax,
      preserveFloatScalarSamples,
    });

    if (fixedAxisSample) {
      return fixedAxisSample;
    }

    return this.sampleGeneralAxisAligned({
      scalarData,
      pixelData,
      dimensions: volume.dimensions,
      width,
      height,
      rowStartIndex,
      xStepIndexDelta,
      yStepIndexDelta,
      interpolationType,
      fallbackMin,
      fallbackMax,
      preserveFloatScalarSamples,
    });
  }

  private sampleGeneralAxisAligned(args: {
    scalarData: ArrayLike<number>;
    pixelData: SliceArray;
    dimensions: Point3;
    width: number;
    height: number;
    rowStartIndex: Point3;
    xStepIndexDelta: Point3;
    yStepIndexDelta: Point3;
    interpolationType: InterpolationType;
    fallbackMin: number;
    fallbackMax: number;
    preserveFloatScalarSamples: boolean;
  }): ScalarViewportSampleResult {
    const {
      scalarData,
      pixelData,
      dimensions,
      width,
      height,
      rowStartIndex,
      xStepIndexDelta,
      yStepIndexDelta,
      interpolationType,
      fallbackMin,
      fallbackMax,
      preserveFloatScalarSamples,
    } = args;
    let sampledMin = Infinity;
    let sampledMax = -Infinity;
    let pixelIndex = 0;
    let rowI = rowStartIndex[0];
    let rowJ = rowStartIndex[1];
    let rowK = rowStartIndex[2];

    for (let y = 0; y < height; y++) {
      let sampleI = rowI;
      let sampleJ = rowJ;
      let sampleK = rowK;

      for (let x = 0; x < width; x++) {
        const sampledValue = this.sampleScalarDataAtContinuousCoordinates(
          scalarData,
          dimensions,
          sampleI,
          sampleJ,
          sampleK,
          interpolationType
        );
        const clampedValue = Number.isFinite(sampledValue)
          ? preserveFloatScalarSamples
            ? Math.min(fallbackMax, Math.max(fallbackMin, sampledValue))
            : Math.round(
                Math.min(fallbackMax, Math.max(fallbackMin, sampledValue))
              )
          : fallbackMin;

        pixelData[pixelIndex++] = clampedValue;
        sampledMin = Math.min(sampledMin, clampedValue);
        sampledMax = Math.max(sampledMax, clampedValue);
        sampleI += xStepIndexDelta[0];
        sampleJ += xStepIndexDelta[1];
        sampleK += xStepIndexDelta[2];
      }

      rowI += yStepIndexDelta[0];
      rowJ += yStepIndexDelta[1];
      rowK += yStepIndexDelta[2];
    }

    return {
      min: sampledMin,
      max: sampledMax,
    };
  }

  private trySampleFixedAxisAligned(args: {
    volume: IImageVolume;
    voxelManager: NonNullable<IImageVolume['voxelManager']>;
    scalarData: ArrayLike<number>;
    pixelData: SliceArray;
    width: number;
    height: number;
    rowStartIndex: Point3;
    xStepIndexDelta: Point3;
    yStepIndexDelta: Point3;
    rightAxis: IndexMajorAxis;
    upAxis: IndexMajorAxis;
    normalAxis: IndexMajorAxis;
    interpolationType: InterpolationType;
    fallbackMin: number;
    fallbackMax: number;
    preserveFloatScalarSamples: boolean;
  }): ScalarViewportSampleResult | undefined {
    const {
      volume,
      voxelManager,
      scalarData,
      pixelData,
      width,
      height,
      rowStartIndex,
      xStepIndexDelta,
      yStepIndexDelta,
      rightAxis,
      upAxis,
      normalAxis,
      interpolationType,
      fallbackMin,
      fallbackMax,
      preserveFloatScalarSamples,
    } = args;

    if (
      !isIndexDeltaOnAxis(xStepIndexDelta, rightAxis.axis) ||
      !isIndexDeltaOnAxis(yStepIndexDelta, upAxis.axis)
    ) {
      return;
    }

    const geometry = this.getOrCreateAxisAlignedGeometry({
      voxelManager,
      dimensions: volume.dimensions,
      width,
      height,
      rowStartIndex,
      xStepIndexDelta,
      yStepIndexDelta,
      rightAxis,
      upAxis,
      normalAxis,
      interpolationType,
    });
    const normal = this.createSingleAxisInterpolation(
      volume.dimensions[normalAxis.axis],
      rowStartIndex[normalAxis.axis],
      interpolationType
    );

    return interpolationType === InterpolationType.NEAREST
      ? this.sampleNearestFixedAxis({
          scalarData,
          pixelData,
          dimensions: volume.dimensions,
          width,
          height,
          rightAxis: rightAxis.axis,
          upAxis: upAxis.axis,
          normalAxis: normalAxis.axis,
          geometry,
          normal,
          fallbackMin,
          fallbackMax,
          preserveFloatScalarSamples,
        })
      : this.sampleLinearFixedAxis({
          scalarData,
          pixelData,
          dimensions: volume.dimensions,
          width,
          height,
          rightAxis: rightAxis.axis,
          upAxis: upAxis.axis,
          normalAxis: normalAxis.axis,
          geometry,
          normal,
          fallbackMin,
          fallbackMax,
          preserveFloatScalarSamples,
        });
  }

  private getOrCreateAxisAlignedGeometry(args: {
    voxelManager: NonNullable<IImageVolume['voxelManager']>;
    dimensions: Point3;
    width: number;
    height: number;
    rowStartIndex: Point3;
    xStepIndexDelta: Point3;
    yStepIndexDelta: Point3;
    rightAxis: IndexMajorAxis;
    upAxis: IndexMajorAxis;
    normalAxis: IndexMajorAxis;
    interpolationType: InterpolationType;
  }): AxisAlignedScalarViewportGeometry {
    const {
      voxelManager,
      dimensions,
      width,
      height,
      rowStartIndex,
      xStepIndexDelta,
      yStepIndexDelta,
      rightAxis,
      upAxis,
      normalAxis,
      interpolationType,
    } = args;
    const key = [
      interpolationType,
      dimensions[0],
      dimensions[1],
      dimensions[2],
      width,
      height,
      rightAxis.axis,
      upAxis.axis,
      normalAxis.axis,
      quantizeGeometryValue(rowStartIndex[rightAxis.axis]),
      quantizeGeometryValue(rowStartIndex[upAxis.axis]),
      quantizeGeometryValue(xStepIndexDelta[rightAxis.axis]),
      quantizeGeometryValue(yStepIndexDelta[upAxis.axis]),
    ].join(':');
    let geometryCache = this.axisAlignedGeometryCache.get(voxelManager);

    if (!geometryCache) {
      geometryCache = new Map();
      this.axisAlignedGeometryCache.set(voxelManager, geometryCache);
    }

    const cachedGeometry = geometryCache.get(key);

    if (cachedGeometry) {
      return cachedGeometry;
    }

    const geometry = {
      key,
      columns: this.createAxisInterpolationPlan(
        dimensions[rightAxis.axis],
        rowStartIndex[rightAxis.axis],
        xStepIndexDelta[rightAxis.axis],
        width,
        interpolationType
      ),
      rows: this.createAxisInterpolationPlan(
        dimensions[upAxis.axis],
        rowStartIndex[upAxis.axis],
        yStepIndexDelta[upAxis.axis],
        height,
        interpolationType
      ),
    };

    geometryCache.set(key, geometry);

    if (geometryCache.size > MAX_AXIS_GEOMETRY_CACHE_ENTRIES) {
      const oldestKey = geometryCache.keys().next().value;

      geometryCache.delete(oldestKey);
    }

    return geometry;
  }

  public createAxisInterpolationPlan(
    dimension: number,
    start: number,
    step: number,
    length: number,
    interpolationType: InterpolationType
  ): AxisInterpolationPlan {
    const lower = new Int32Array(length);
    const upper = new Int32Array(length);
    const fraction = new Float64Array(length);
    const valid = new Uint8Array(length);
    let coordinate = start;

    for (let index = 0; index < length; index++) {
      const interpolation = this.createSingleAxisInterpolation(
        dimension,
        coordinate,
        interpolationType
      );

      lower[index] = interpolation.lower;
      upper[index] = interpolation.upper;
      fraction[index] = interpolation.fraction;
      valid[index] = interpolation.valid ? 1 : 0;
      coordinate += step;
    }

    return {
      lower,
      upper,
      fraction,
      valid,
    };
  }

  private createSingleAxisInterpolation(
    dimension: number,
    coordinate: number,
    interpolationType: InterpolationType
  ): SingleAxisInterpolation {
    const clampedCoordinate = getSpatiallyClampedContinuousCoordinate(
      dimension,
      coordinate
    );

    if (clampedCoordinate === undefined) {
      return {
        lower: -1,
        upper: -1,
        fraction: 0,
        valid: false,
      };
    }

    if (interpolationType === InterpolationType.NEAREST) {
      const index = getNearestVoxelIndex(clampedCoordinate);

      return {
        lower: index,
        upper: index,
        fraction: 0,
        valid: true,
      };
    }

    const lower = Math.floor(clampedCoordinate);
    const upper = Math.min(lower + 1, dimension - 1);

    return {
      lower,
      upper,
      fraction: clampedCoordinate - lower,
      valid: true,
    };
  }

  private sampleNearestFixedAxis(args: {
    scalarData: ArrayLike<number>;
    pixelData: SliceArray;
    dimensions: Point3;
    width: number;
    height: number;
    rightAxis: 0 | 1 | 2;
    upAxis: 0 | 1 | 2;
    normalAxis: 0 | 1 | 2;
    geometry: AxisAlignedScalarViewportGeometry;
    normal: SingleAxisInterpolation;
    fallbackMin: number;
    fallbackMax: number;
    preserveFloatScalarSamples: boolean;
  }): ScalarViewportSampleResult {
    const {
      scalarData,
      pixelData,
      dimensions,
      width,
      height,
      rightAxis,
      upAxis,
      normalAxis,
      geometry,
      normal,
      fallbackMin,
      fallbackMax,
      preserveFloatScalarSamples,
    } = args;
    const strides = [1, dimensions[0], dimensions[0] * dimensions[1]] as Point3;
    const column = geometry.columns;
    const row = geometry.rows;
    let sampledMin = Infinity;
    let sampledMax = -Infinity;
    let pixelIndex = 0;

    if (!normal.valid) {
      pixelData.fill(fallbackMin);
      return { min: fallbackMin, max: fallbackMin };
    }

    const normalOffset = normal.lower * strides[normalAxis];

    for (let y = 0; y < height; y++) {
      if (!row.valid[y]) {
        for (let x = 0; x < width; x++) {
          pixelData[pixelIndex++] = fallbackMin;
        }
        sampledMin = Math.min(sampledMin, fallbackMin);
        sampledMax = Math.max(sampledMax, fallbackMin);
        continue;
      }

      const rowOffset = row.lower[y] * strides[upAxis] + normalOffset;

      for (let x = 0; x < width; x++) {
        let clampedValue = fallbackMin;

        if (column.valid[x]) {
          const scalar = Number(
            scalarData[rowOffset + column.lower[x] * strides[rightAxis]]
          );

          clampedValue = Number.isFinite(scalar)
            ? preserveFloatScalarSamples
              ? Math.min(fallbackMax, Math.max(fallbackMin, scalar))
              : Math.round(Math.min(fallbackMax, Math.max(fallbackMin, scalar)))
            : fallbackMin;
        }

        pixelData[pixelIndex++] = clampedValue;
        sampledMin = Math.min(sampledMin, clampedValue);
        sampledMax = Math.max(sampledMax, clampedValue);
      }
    }

    return {
      min: sampledMin,
      max: sampledMax,
    };
  }

  private sampleLinearFixedAxis(args: {
    scalarData: ArrayLike<number>;
    pixelData: SliceArray;
    dimensions: Point3;
    width: number;
    height: number;
    rightAxis: 0 | 1 | 2;
    upAxis: 0 | 1 | 2;
    normalAxis: 0 | 1 | 2;
    geometry: AxisAlignedScalarViewportGeometry;
    normal: SingleAxisInterpolation;
    fallbackMin: number;
    fallbackMax: number;
    preserveFloatScalarSamples: boolean;
  }): ScalarViewportSampleResult {
    const {
      scalarData,
      pixelData,
      dimensions,
      width,
      height,
      rightAxis,
      upAxis,
      normalAxis,
      geometry,
      normal,
      fallbackMin,
      fallbackMax,
      preserveFloatScalarSamples,
    } = args;
    const strides = [1, dimensions[0], dimensions[0] * dimensions[1]] as Point3;
    const column = geometry.columns;
    const row = geometry.rows;
    const normalLowerOffset = normal.lower * strides[normalAxis];
    const normalUpperOffset = normal.upper * strides[normalAxis];
    const normalFraction = normal.fraction;
    const oneMinusNormalFraction = 1 - normalFraction;
    let sampledMin = Infinity;
    let sampledMax = -Infinity;
    let pixelIndex = 0;

    if (!normal.valid) {
      pixelData.fill(fallbackMin);
      return { min: fallbackMin, max: fallbackMin };
    }

    for (let y = 0; y < height; y++) {
      if (!row.valid[y]) {
        for (let x = 0; x < width; x++) {
          pixelData[pixelIndex++] = fallbackMin;
        }
        sampledMin = Math.min(sampledMin, fallbackMin);
        sampledMax = Math.max(sampledMax, fallbackMin);
        continue;
      }

      const rowLowerOffset = row.lower[y] * strides[upAxis];
      const rowUpperOffset = row.upper[y] * strides[upAxis];
      const rowFraction = row.fraction[y];
      const oneMinusRowFraction = 1 - rowFraction;

      for (let x = 0; x < width; x++) {
        let clampedValue = fallbackMin;

        if (column.valid[x]) {
          const columnLowerOffset = column.lower[x] * strides[rightAxis];
          const columnUpperOffset = column.upper[x] * strides[rightAxis];
          const columnFraction = column.fraction[x];
          const oneMinusColumnFraction = 1 - columnFraction;
          const c000 = Number(
            scalarData[columnLowerOffset + rowLowerOffset + normalLowerOffset]
          );
          const c100 = Number(
            scalarData[columnUpperOffset + rowLowerOffset + normalLowerOffset]
          );
          const c010 = Number(
            scalarData[columnLowerOffset + rowUpperOffset + normalLowerOffset]
          );
          const c110 = Number(
            scalarData[columnUpperOffset + rowUpperOffset + normalLowerOffset]
          );
          const c001 = Number(
            scalarData[columnLowerOffset + rowLowerOffset + normalUpperOffset]
          );
          const c101 = Number(
            scalarData[columnUpperOffset + rowLowerOffset + normalUpperOffset]
          );
          const c011 = Number(
            scalarData[columnLowerOffset + rowUpperOffset + normalUpperOffset]
          );
          const c111 = Number(
            scalarData[columnUpperOffset + rowUpperOffset + normalUpperOffset]
          );
          const c00 = c000 * oneMinusColumnFraction + c100 * columnFraction;
          const c10 = c010 * oneMinusColumnFraction + c110 * columnFraction;
          const c01 = c001 * oneMinusColumnFraction + c101 * columnFraction;
          const c11 = c011 * oneMinusColumnFraction + c111 * columnFraction;
          const c0 = c00 * oneMinusRowFraction + c10 * rowFraction;
          const c1 = c01 * oneMinusRowFraction + c11 * rowFraction;
          const scalar = c0 * oneMinusNormalFraction + c1 * normalFraction;

          clampedValue = Number.isFinite(scalar)
            ? preserveFloatScalarSamples
              ? Math.min(fallbackMax, Math.max(fallbackMin, scalar))
              : Math.round(Math.min(fallbackMax, Math.max(fallbackMin, scalar)))
            : fallbackMin;
        }

        pixelData[pixelIndex++] = clampedValue;
        sampledMin = Math.min(sampledMin, clampedValue);
        sampledMax = Math.max(sampledMax, clampedValue);
      }
    }

    return {
      min: sampledMin,
      max: sampledMax,
    };
  }

  private sampleScalarDataAtContinuousCoordinates(
    scalarData: ArrayLike<number>,
    dimensions: Point3,
    sampleI: number,
    sampleJ: number,
    sampleK: number,
    interpolationType: InterpolationType
  ): number {
    const i = getSpatiallyClampedContinuousCoordinate(dimensions[0], sampleI);
    const j = getSpatiallyClampedContinuousCoordinate(dimensions[1], sampleJ);
    const k = getSpatiallyClampedContinuousCoordinate(dimensions[2], sampleK);

    if (i === undefined || j === undefined || k === undefined) {
      return NaN;
    }

    return interpolationType === InterpolationType.NEAREST
      ? this.sampleNearestScalarDataAtContinuousCoordinates(
          scalarData,
          dimensions,
          i,
          j,
          k
        )
      : this.sampleLinearScalarDataAtContinuousCoordinates(
          scalarData,
          dimensions,
          i,
          j,
          k
        );
  }

  private sampleNearestScalarDataAtContinuousCoordinates(
    scalarData: ArrayLike<number>,
    dimensions: Point3,
    sampleI: number,
    sampleJ: number,
    sampleK: number
  ): number {
    const i = getNearestVoxelIndex(sampleI);
    const j = getNearestVoxelIndex(sampleJ);
    const k = getNearestVoxelIndex(sampleK);
    const index = i + j * dimensions[0] + k * dimensions[0] * dimensions[1];

    return Number(scalarData[index]);
  }

  private sampleLinearScalarDataAtContinuousCoordinates(
    scalarData: ArrayLike<number>,
    dimensions: Point3,
    sampleI: number,
    sampleJ: number,
    sampleK: number
  ): number {
    const dx = dimensions[0];
    const dy = dimensions[1];
    const dz = dimensions[2];
    const frameSize = dx * dy;
    const i0 = Math.floor(sampleI);
    const j0 = Math.floor(sampleJ);
    const k0 = Math.floor(sampleK);
    const i1 = Math.min(i0 + 1, dx - 1);
    const j1 = Math.min(j0 + 1, dy - 1);
    const k1 = Math.min(k0 + 1, dz - 1);
    const di = sampleI - i0;
    const dj = sampleJ - j0;
    const dk = sampleK - k0;
    const oneMinusDi = 1 - di;
    const oneMinusDj = 1 - dj;
    const oneMinusDk = 1 - dk;
    const j0Offset = j0 * dx;
    const j1Offset = j1 * dx;
    const k0Offset = k0 * frameSize;
    const k1Offset = k1 * frameSize;
    const c000 = Number(scalarData[i0 + j0Offset + k0Offset]);
    const c100 = Number(scalarData[i1 + j0Offset + k0Offset]);
    const c010 = Number(scalarData[i0 + j1Offset + k0Offset]);
    const c110 = Number(scalarData[i1 + j1Offset + k0Offset]);
    const c001 = Number(scalarData[i0 + j0Offset + k1Offset]);
    const c101 = Number(scalarData[i1 + j0Offset + k1Offset]);
    const c011 = Number(scalarData[i0 + j1Offset + k1Offset]);
    const c111 = Number(scalarData[i1 + j1Offset + k1Offset]);
    const c00 = c000 * oneMinusDi + c100 * di;
    const c10 = c010 * oneMinusDi + c110 * di;
    const c01 = c001 * oneMinusDi + c101 * di;
    const c11 = c011 * oneMinusDi + c111 * di;
    const c0 = c00 * oneMinusDj + c10 * dj;
    const c1 = c01 * oneMinusDj + c11 * dj;

    return c0 * oneMinusDk + c1 * dk;
  }
}
