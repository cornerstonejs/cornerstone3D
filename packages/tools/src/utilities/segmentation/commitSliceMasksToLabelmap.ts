import { cache, utilities, type Types } from '@cornerstonejs/core';
import { FLOOD_SLICE_FLAG_VISITED } from './floodFillSliceLazy';

const { VoxelManager } = utilities;

type WritableScalarSlice = {
  length: number;
  fill: (value: number, start: number, end: number) => void;
};

/** Structural view of labelmap / per-slice voxel managers (avoids intersecting with private `scalarData`). */
type LabelmapCommitVm = {
  scalarData?: WritableScalarSlice | null;
  modifiedSlices: Set<number>;
  boundsIJK: Types.BoundsIJK;
  setAtIndex: (index: number, v: number) => unknown;
};

/**
 * Writes slice visit masks into the labelmap using **row runs** (`TypedArray.fill` per run)
 * when slice `scalarData` is available; otherwise falls back to `setAtIndex` per voxel.
 *
 * Also builds `floodedPoints` for downstream preview promotion / island removal.
 */
export function commitSliceMasksToLabelmapVolume({
  labelmapVolume,
  sliceMasks,
  width: w,
  height: h,
  paintIndex,
}: {
  labelmapVolume: Types.IImageVolume;
  sliceMasks: Map<number, Uint8Array>;
  width: number;
  height: number;
  paintIndex: number;
}): { floodedPoints: Types.Point3[]; voxelCount: number } {
  const floodedPoints: Types.Point3[] = [];
  let voxelCount = 0;

  const vm = labelmapVolume.voxelManager as unknown as LabelmapCommitVm;
  const depth = labelmapVolume.dimensions[2];
  const frameSize = w * h;
  const expectedLen = frameSize * depth;

  const zs = Array.from(sliceMasks.keys()).sort((a, b) => a - b);

  for (let zi = 0; zi < zs.length; zi++) {
    const z = zs[zi];
    if (z < 0 || z >= depth) {
      continue;
    }
    const flags = sliceMasks.get(z);
    if (!flags || flags.length !== frameSize) {
      continue;
    }

    let sliceTouched = false;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const appendRunFlooded = (y: number, x0: number, x1: number) => {
      for (let xi = x0; xi < x1; xi++) {
        floodedPoints.push([xi, y, z]);
      }
      voxelCount += x1 - x0;
      sliceTouched = true;
      minX = Math.min(minX, x0);
      maxX = Math.max(maxX, x1 - 1);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    };

    const denseScalar =
      vm.scalarData &&
      vm.scalarData.length >= expectedLen &&
      typeof vm.scalarData.fill === 'function';

    if (denseScalar) {
      const base = z * frameSize;
      const data = vm.scalarData as WritableScalarSlice;
      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; ) {
          const li = row + x;
          if (!(flags[li] & FLOOD_SLICE_FLAG_VISITED)) {
            x++;
            continue;
          }
          const x0 = x;
          while (x < w && flags[row + x] & FLOOD_SLICE_FLAG_VISITED) {
            x++;
          }
          data.fill(paintIndex, base + row + x0, base + row + x);
          appendRunFlooded(y, x0, x);
        }
      }
    } else {
      const imageIds = labelmapVolume.imageIds;
      const image =
        imageIds?.length && z < imageIds.length
          ? cache.getImage(imageIds[z])
          : null;
      const svm = image?.voxelManager as unknown as
        | LabelmapCommitVm
        | undefined;

      if (
        svm?.scalarData &&
        svm.scalarData.length >= frameSize &&
        typeof svm.scalarData.fill === 'function'
      ) {
        const data = svm.scalarData as WritableScalarSlice;
        for (let y = 0; y < h; y++) {
          const row = y * w;
          for (let x = 0; x < w; ) {
            const li = row + x;
            if (!(flags[li] & FLOOD_SLICE_FLAG_VISITED)) {
              x++;
              continue;
            }
            const x0 = x;
            while (x < w && flags[row + x] & FLOOD_SLICE_FLAG_VISITED) {
              x++;
            }
            data.fill(paintIndex, row + x0, row + x);
            appendRunFlooded(y, x0, x);
          }
        }
        svm.modifiedSlices.add(z);
      } else {
        for (let y = 0; y < h; y++) {
          const row = y * w;
          for (let x = 0; x < w; x++) {
            if (!(flags[row + x] & FLOOD_SLICE_FLAG_VISITED)) {
              continue;
            }
            const index = z * frameSize + row + x;
            vm.setAtIndex(index, paintIndex);
            floodedPoints.push([x, y, z]);
            voxelCount++;
            sliceTouched = true;
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
          }
        }
      }
    }

    if (sliceTouched) {
      vm.modifiedSlices.add(z);
      if (
        Number.isFinite(minX) &&
        Number.isFinite(minY) &&
        Number.isFinite(maxX) &&
        Number.isFinite(maxY)
      ) {
        VoxelManager.addBounds(vm.boundsIJK, [minX, minY, z]);
        VoxelManager.addBounds(vm.boundsIJK, [maxX, maxY, z]);
      }
    }
  }

  return { floodedPoints, voxelCount };
}
