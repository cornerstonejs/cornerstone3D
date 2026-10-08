import type { PixelDataTypedArray, Point3 } from '../../types';
import type { BrickOrder } from './types';

export interface WriteBrickOptions {
  /** Decoded packed brick: width `sourceSize[0]`, height `sourceSize[1] * sourceSize[2]`. */
  source: PixelDataTypedArray;
  /**
   * Dimensions the brick was packed at, which set the packed row stride.
   *
   * Equal to {@link extent} for an unpadded store; equal to the level's brick
   * size for a padded one, where an edge brick is a full-size image with zeros
   * in the part beyond the volume.
   */
  sourceSize: Point3;
  /** Row ordering used when the brick was packed. */
  brickOrder: BrickOrder;
  /** Occupied extent of this brick, clipped at its level's edge. */
  extent: Point3;
  /** Brick origin in its own level's voxel coordinates. */
  originVoxel: Point3;
  /** Destination volume buffer. */
  dest: PixelDataTypedArray;
  /** Destination volume dimensions. */
  destDimensions: Point3;
  /**
   * Destination voxels per source voxel along each axis. `[1,1,1]` writes at
   * matching resolution; a coarse level uses its downsample factor to
   * nearest-upsample into a full-extent buffer.
   */
  factor?: Point3;
  /**
   * Modality LUT applied on the way in, so the buffer holds the same units the
   * streaming frame path produces.
   *
   * Bricks store raw stored values; a CT with `RescaleIntercept -1024` is
   * 0..4095 on disk but must be -1024..3071 HU in the volume. Skipping this
   * leaves every voxel shifted by the intercept, so air sits mid-window and the
   * image renders uniformly grey with no black background.
   */
  scaling?: { rescaleSlope: number; rescaleIntercept: number };
}

export interface WriteBrickResult {
  /** Destination voxels written. */
  voxelsWritten: number;
  /** First destination z-slice touched, or -1 when nothing was written. */
  zStart: number;
  /** Last destination z-slice touched (inclusive), or -1. */
  zEnd: number;
}

const EMPTY: WriteBrickResult = { voxelsWritten: 0, zStart: -1, zEnd: -1 };

/**
 * Index of voxel `(bx, by, bz)` within a packed brick codestream.
 *
 * The packing exists so JPEG-LS's left and above neighbours are true 3D
 * neighbours — see {@link BrickOrder}.
 */
export function packedIndex(
  bx: number,
  by: number,
  bz: number,
  sourceSize: Point3,
  brickOrder: BrickOrder
): number {
  const row =
    brickOrder === 'z-minor'
      ? by * sourceSize[2] + bz
      : bz * sourceSize[1] + by;

  return bx + row * sourceSize[0];
}

/**
 * Scatters one decoded brick into a volume buffer, optionally upsampling.
 *
 * Always copies. That is required regardless of intent, because the JPEG-LS
 * decoder returns a view onto WASM heap memory that the next `decode()` call
 * overwrites.
 *
 * Writes are clipped to the destination, so a coarse level whose
 * `ceil`-rounded extent overhangs the base dimensions is handled without the
 * caller trimming first.
 *
 * @returns Voxels written and the destination z-range touched, for
 * `setUpdatedFrame` bookkeeping.
 */
export function writeBrickIntoVolume(
  options: WriteBrickOptions
): WriteBrickResult {
  const {
    source,
    sourceSize,
    brickOrder,
    extent,
    originVoxel,
    dest,
    destDimensions,
    factor = [1, 1, 1] as Point3,
    scaling,
  } = options;

  // Identity slope/intercept is the common case; skip the arithmetic entirely.
  const slope = scaling?.rescaleSlope ?? 1;
  const intercept = scaling?.rescaleIntercept ?? 0;
  const rescale = slope !== 1 || intercept !== 0;

  if (extent[0] <= 0 || extent[1] <= 0 || extent[2] <= 0) {
    return EMPTY;
  }

  const [fx, fy, fz] = factor;
  const [dx, dy] = destDimensions;
  const sliceStride = dx * dy;

  // Destination origin of this brick, and how far it may extend.
  const baseX = originVoxel[0] * fx;
  const baseY = originVoxel[1] * fy;
  const baseZ = originVoxel[2] * fz;

  if (baseX >= dx || baseY >= dy || baseZ >= destDimensions[2]) {
    return EMPTY;
  }

  // One expanded source row, reused across the y and z replication factors.
  const rowLength = Math.min(extent[0] * fx, dx - baseX);
  const row = new (dest.constructor as new (n: number) => PixelDataTypedArray)(
    rowLength
  );

  let voxelsWritten = 0;
  let zStart = -1;
  let zEnd = -1;

  for (let bz = 0; bz < extent[2]; bz++) {
    for (let by = 0; by < extent[1]; by++) {
      // Expand this source row in x once, applying the modality LUT as we go.
      for (let i = 0, bx = 0; bx < extent[0] && i < rowLength; bx++) {
        const stored = source[packedIndex(bx, by, bz, sourceSize, brickOrder)];
        const value = rescale ? stored * slope + intercept : stored;
        for (let r = 0; r < fx && i < rowLength; r++, i++) {
          row[i] = value;
        }
      }

      // Replicate it across the destination y and z ranges.
      for (let rz = 0; rz < fz; rz++) {
        const destZ = baseZ + bz * fz + rz;
        if (destZ >= destDimensions[2]) {
          break;
        }

        for (let ry = 0; ry < fy; ry++) {
          const destY = baseY + by * fy + ry;
          if (destY >= dy) {
            break;
          }

          dest.set(row, destZ * sliceStride + destY * dx + baseX);
          voxelsWritten += rowLength;

          if (zStart === -1 || destZ < zStart) {
            zStart = destZ;
          }
          if (destZ > zEnd) {
            zEnd = destZ;
          }
        }
      }
    }
  }

  return { voxelsWritten, zStart, zEnd };
}
