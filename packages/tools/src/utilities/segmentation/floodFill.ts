import type {
  FloodFillResult,
  FloodFillGetter,
  FloodFillOptions,
} from '../../types';
import type { Types } from '@cornerstonejs/core';

/**
 * N-dimensional flood fill (based on https://github.com/tuzz/n-dimensional-flood-fill).
 * Async API: yields to the event loop periodically and can await per-slice loading for 3D data.
 *
 * @returns Promise resolving to flooded points.
 */
async function floodFill(
  getter: FloodFillGetter,
  seed: Types.Point2 | Types.Point3,
  options: FloodFillOptions = {}
): Promise<FloodFillResult> {
  const onFlood = options.onFlood;
  const onBoundary = options.onBoundary;
  const equals = options.equals;
  const filter = options.filter;
  const planar = options.planar === true;
  const diagonals = options.diagonals || false;
  const bounds = options.bounds;
  const ensureSliceLoaded = options.ensureSliceLoaded;
  const yieldEvery = options.yieldEvery ?? 500;

  const is3D = seed.length === 3;
  if (is3D && ensureSliceLoaded) {
    await ensureSliceLoaded(seed[2] as number);
  }

  const startNode = get(seed);
  const permutations = prunedPermutations();
  const stack: {
    currentArgs: Types.Point2 | Types.Point3;
    previousArgs?: Types.Point2 | Types.Point3;
  }[] = [];
  const flooded: Types.Point2[] | Types.Point3[] = [];
  const visitedBuffer = options.visitedBuffer;
  /** All visited keys when not using {@link visitedBuffer}; OOB keys when using dense buffer. */
  const visitsSet = new Set<number>();
  let iteration = 0;

  stack.push({ currentArgs: seed });

  async function yieldIfNeeded() {
    iteration++;
    if (yieldEvery > 0 && iteration % yieldEvery === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }

  while (stack.length > 0) {
    await yieldIfNeeded();
    const job = stack.pop();
    await flood(job);
  }

  return { flooded };

  async function flood(job: {
    currentArgs: Types.Point2 | Types.Point3;
    previousArgs?: Types.Point2 | Types.Point3;
  }) {
    const getArgs = job.currentArgs;
    const prevArgs = job.previousArgs;

    if (visited(getArgs)) {
      return;
    }

    if (is3D && ensureSliceLoaded) {
      await ensureSliceLoaded((getArgs as Types.Point3)[2]);
    }

    markAsVisited(getArgs);

    if (member(getArgs)) {
      markAsFlooded(getArgs);
      pushAdjacent(getArgs);
    } else {
      markAsBoundary(prevArgs);
    }
  }

  function packVisitedKey(x: number, y: number, z: number): number {
    return x + 32768 + 65536 * (y + 32768 + 65536 * (z + 32768));
  }

  /** @returns linear index, or -1 if out of volume / invalid for the buffer layout */
  function linearVisitIndex(x: number, y: number, z: number): number {
    if (!visitedBuffer) {
      return -1;
    }
    const w = visitedBuffer.width;
    const h = visitedBuffer.height;
    if (x < 0 || x >= w || y < 0 || y >= h) {
      return -1;
    }
    if (visitedBuffer.depth === undefined) {
      return x + y * w;
    }
    const d = visitedBuffer.depth;
    if (z < 0 || z >= d) {
      return -1;
    }
    return x + y * w + z * w * h;
  }

  function visited(key: Types.Point2 | Types.Point3) {
    const [x, y, z = 0] = key;
    if (visitedBuffer) {
      const li = linearVisitIndex(x, y, z);
      if (li >= 0) {
        return visitedBuffer.data[li] !== 0;
      }
      return visitsSet.has(packVisitedKey(x, y, z));
    }
    return visitsSet.has(packVisitedKey(x, y, z));
  }

  function markAsVisited(key: Types.Point2 | Types.Point3) {
    const [x, y, z = 0] = key;
    if (visitedBuffer) {
      const li = linearVisitIndex(x, y, z);
      if (li >= 0) {
        visitedBuffer.data[li] = 1;
        return;
      }
      visitsSet.add(packVisitedKey(x, y, z));
      return;
    }
    visitsSet.add(packVisitedKey(x, y, z));
  }

  function member(getArgs: Types.Point2 | Types.Point3) {
    const node = get(getArgs);
    return equals ? equals(node, startNode) : node === startNode;
  }

  function markAsFlooded(getArgs: Types.Point2 | Types.Point3) {
    flooded.push(getArgs as Types.Point2 & Types.Point3);
    if (onFlood) {
      // @ts-expect-error spread tuple
      onFlood(...getArgs);
    }
  }

  function markAsBoundary(prevArgs: Types.Point2 | Types.Point3 | undefined) {
    if (prevArgs === undefined) {
      return;
    }
    const [x, y, z = 0] = prevArgs;
    const iKey = packVisitedKey(x, y, z);
    bounds?.set(iKey, prevArgs);
    if (onBoundary) {
      // @ts-expect-error spread tuple
      onBoundary(...prevArgs);
    }
  }

  function pushAdjacent(getArgs: Types.Point2 | Types.Point3) {
    for (let i = 0; i < permutations.length; i += 1) {
      const perm = permutations[i];
      const nextArgs = getArgs.slice(0) as Types.Point2 | Types.Point3;

      for (let j = 0; j < getArgs.length; j += 1) {
        nextArgs[j] += perm[j];
      }
      if (
        planar &&
        is3D &&
        (nextArgs as Types.Point3)[2] !== (seed as Types.Point3)[2]
      ) {
        continue;
      }
      if (filter?.(nextArgs) === false) {
        continue;
      }
      if (visited(nextArgs)) {
        continue;
      }

      stack.push({
        currentArgs: nextArgs,
        previousArgs: getArgs,
      });
    }
  }

  function get(getArgs: Types.Point2 | Types.Point3) {
    // @ts-expect-error spread tuple
    return getter(...getArgs);
  }

  function prunedPermutations() {
    const allPerms = permute(seed.length);
    return allPerms.filter(function (perm) {
      const count = countNonZeroes(perm);
      return count !== 0 && (count === 1 || diagonals);
    });
  }

  function permute(length: number) {
    const perms: number[][] = [];
    const permutation = function (str: string) {
      return str.split('').map(function (c) {
        return parseInt(c, 10) - 1;
      });
    };
    for (let i = 0; i < Math.pow(3, length); i += 1) {
      const string = lpad(i.toString(3), '0', length);
      perms.push(permutation(string));
    }
    return perms;
  }
}

function countNonZeroes(array: number[]) {
  let count = 0;
  for (let i = 0; i < array.length; i += 1) {
    if (array[i] !== 0) {
      count += 1;
    }
  }
  return count;
}

function lpad(string: string, character: string, length: number) {
  const array = new Array(length + 1);
  const pad = array.join(character);
  return (pad + string).slice(-length);
}

export default floodFill;
