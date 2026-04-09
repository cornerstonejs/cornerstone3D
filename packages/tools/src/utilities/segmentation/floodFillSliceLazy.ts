import type { Types } from '@cornerstonejs/core';

/** Visited in slice-lazy flood (bit 0). Room for more flags later (e.g. queued). */
export const FLOOD_SLICE_FLAG_VISITED = 1;

export type FloodFillSliceLazyOptions = {
  width: number;
  height: number;
  depth: number;
  equals: (node: unknown, startNode: unknown) => boolean;
  ensureSliceLoaded?: (z: number) => Promise<void>;
  yieldEvery?: number;
  planar?: boolean;
  /**
   * Optional bound in index-k from the seed slice: allow only voxels with
   * `abs(k - seedK) <= maxDeltaK`.
   */
  maxDeltaK?: number;
  /**
   * Optional in-slice bound from the seed pixel: allow only voxels with
   * `abs(i - seedI) <= maxDeltaIJ` AND `abs(j - seedJ) <= maxDeltaIJ`.
   */
  maxDeltaIJ?: number;
};

export type FloodFillSliceLazyResult = {
  /** Only slices that received at least one filled voxel are present. */
  sliceMasks: Map<number, Uint8Array>;
  voxelCount: number;
};

/**
 * 3D flood fill with **per-slice** `Uint8Array` visit masks (allocated on demand per k).
 * Uses BFS and a packed linear queue to avoid `Set` hashing and a single giant 3D buffer.
 */
export async function floodFill3dSliceLazy(
  getter: (x: number, y: number, z: number) => number | undefined,
  seed: Types.Point3,
  options: FloodFillSliceLazyOptions
): Promise<FloodFillSliceLazyResult> {
  const {
    width: w,
    height: h,
    depth: d,
    equals,
    ensureSliceLoaded,
    yieldEvery = 500,
    planar = false,
    maxDeltaK,
    maxDeltaIJ,
  } = options;

  const [sx, sy, sz] = seed;
  if (sx < 0 || sx >= w || sy < 0 || sy >= h || sz < 0 || sz >= d) {
    return { sliceMasks: new Map(), voxelCount: 0 };
  }

  if (ensureSliceLoaded) {
    await ensureSliceLoaded(sz);
  }

  const startNode = getter(sx, sy, sz);
  if (!equals(startNode, startNode)) {
    return { sliceMasks: new Map(), voxelCount: 0 };
  }

  const frameSize = w * h;
  const sliceMasks = new Map<number, Uint8Array>();

  function sliceFlags(z: number): Uint8Array {
    let a = sliceMasks.get(z);
    if (!a) {
      a = new Uint8Array(frameSize);
      sliceMasks.set(z, a);
    }
    return a;
  }

  function isVisited(z: number, x: number, y: number): boolean {
    const a = sliceMasks.get(z);
    if (!a) {
      return false;
    }
    return (a[y * w + x] & FLOOD_SLICE_FLAG_VISITED) !== 0;
  }

  function setVisited(z: number, x: number, y: number): void {
    sliceFlags(z)[y * w + x] |= FLOOD_SLICE_FLAG_VISITED;
  }

  function pack(x: number, y: number, z: number): number {
    return z * frameSize + y * w + x;
  }

  function unpack(p: number): [number, number, number] {
    const x = p % w;
    const t1 = Math.floor(p / w);
    const y = t1 % h;
    const z = Math.floor(t1 / h);
    return [x, y, z];
  }

  const dirs = planar
    ? [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
      ]
    : [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];

  const queue: number[] = [];
  let qh = 0;
  queue.push(pack(sx, sy, sz));
  setVisited(sz, sx, sy);

  let steps = 0;

  while (qh < queue.length) {
    steps++;
    if (yieldEvery > 0 && steps % yieldEvery === 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }

    const p = queue[qh++];
    const [x, y, z] = unpack(p);

    for (let di = 0; di < dirs.length; di++) {
      const nx = x + dirs[di][0];
      const ny = y + dirs[di][1];
      const nz = z + dirs[di][2];
      if (nx < 0 || nx >= w || ny < 0 || ny >= h || nz < 0 || nz >= d) {
        continue;
      }
      if (maxDeltaK >= 0 && Math.abs(nz - sz) > maxDeltaK) {
        continue;
      }
      if (
        maxDeltaIJ >= 0 &&
        (Math.abs(nx - sx) > maxDeltaIJ || Math.abs(ny - sy) > maxDeltaIJ)
      ) {
        continue;
      }
      if (planar && nz !== sz) {
        continue;
      }
      if (isVisited(nz, nx, ny)) {
        continue;
      }
      if (ensureSliceLoaded) {
        await ensureSliceLoaded(nz);
      }
      const nv = getter(nx, ny, nz);
      if (!equals(nv, startNode)) {
        continue;
      }
      setVisited(nz, nx, ny);
      queue.push(pack(nx, ny, nz));
    }
  }

  let voxelCount = 0;
  for (const arr of sliceMasks.values()) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] & FLOOD_SLICE_FLAG_VISITED) {
        voxelCount++;
      }
    }
  }

  return { sliceMasks, voxelCount };
}
