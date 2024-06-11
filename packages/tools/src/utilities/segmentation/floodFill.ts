import type {
  FloodFillResult,
  FloodFillGetter,
  FloodFillOptions,
} from '../../types';
import { Types } from '@cornerstonejs/core';

/**
 * floodFill.js - Taken from MIT OSS lib - https://github.com/tuzz/n-dimensional-flood-fill
 * Refactored to ES6.  Fixed the bounds/visits checks to use integer keys, restricting the
 * total search spacing to +/- 32k in each dimension, but resulting in about a hundred time
 * performance gain for larger regions since JavaScript does not have a hash map to allow the
 * map to work on keys.
 *
 * @param getter The getter to the elements of your data structure,
 *                          e.g. getter(x,y) for a 2D interprettation of your structure.
 * @param seed The seed for your fill. The dimensionality is infered
 *                        by the number of dimensions of the seed.
 * @param options.onFlood - An optional callback to execute when each pixel is flooded.
 *                             e.g. onFlood(x,y).
 * @param options.onBoundary - An optional callback to execute whenever a boundary is reached.
 *                                a boundary could be another segmentIndex, or the edge of your
 *                                data structure (i.e. when your getter returns undefined).
 * @param options.equals - An optional equality method for your datastructure.
 *                            Default is simply value1 = value2.
 * @param options.diagonals - Whether you allow flooding through diagonals. Defaults to false.
 *
 * @returns Flood fill results
 */
function floodFill(
  getter: FloodFillGetter,
  seed: Types.Point2 | Types.Point3,
  options: FloodFillOptions = {}
): FloodFillResult {
  const onFlood = options.onFlood;
  const onBoundary = options.onBoundary;
  const equals = options.equals;
  const diagonals = options.diagonals || false;
  const startNode = get(seed);
  const permutations = prunedPermutations();
  const stack = [];
  const flooded = [];
  const visits = new Set();
  const bounds = new Map();

  stack.push({ currentArgs: seed });

  while (stack.length > 0) {
    flood(stack.pop());
  }

  return {
    flooded,
    boundaries: boundaries(),
  };

  function flood(job) {
    const getArgs = job.currentArgs;
    const prevArgs = job.previousArgs;

    if (visited(getArgs)) {
      return;
    }
    markAsVisited(getArgs);

    if (member(getArgs)) {
      markAsFlooded(getArgs);
      pushAdjacent(getArgs);
    } else {
      markAsBoundary(prevArgs);
    }
  }

  /**
   * Indicates if the key has been visited.
   * @param key is a 2 or 3 element vector with values -32768...32767
   */
  function visited(key) {
    const [x, y, z = 0] = key;
    // Use an integer key value for checking visited, since JavaScript does not
    // provide a generic hash key indexed hash map.
    const iKey = x + 32768 + 65536 * (y + 32768 + 65536 * (z + 32768));
    return visits.has(iKey);
  }

  function markAsVisited(key) {
    const [x, y, z = 0] = key;
    const iKey = x + 32768 + 65536 * (y + 32768 + 65536 * (z + 32768));
    visits.add(iKey);
  }

  function member(getArgs) {
    const node = get(getArgs);

    return equals ? equals(node, startNode) : node === startNode;
  }

  function markAsFlooded(getArgs) {
    flooded.push(getArgs);
    if (onFlood) {
      //@ts-ignore
      onFlood(...getArgs);
    }
  }

  function markAsBoundary(prevArgs) {
    const [x, y, z = 0] = prevArgs;
    // Use an integer key value for checking visited, since JavaScript does not
    // provide a generic hash key indexed hash map.
    const iKey = x + 32768 + 65536 * (y + 32768 + 65536 * (z + 32768));
    bounds.set(iKey, prevArgs);
    if (onBoundary) {
      //@ts-ignore
      onBoundary(...prevArgs);
    }
  }

  function pushAdjacent(getArgs) {
    for (let i = 0; i < permutations.length; i += 1) {
      const perm = permutations[i];
      const nextArgs = getArgs.slice(0);

      for (let j = 0; j < getArgs.length; j += 1) {
        nextArgs[j] += perm[j];
      }

      stack.push({
        currentArgs: nextArgs,
        previousArgs: getArgs,
      });
    }
  }

  function get(getArgs) {
    //@ts-ignore
    return getter(...getArgs);
  }

  // This is a significant performance hit - should be done as a wrapper
  // only when needed.
  // function safely(f, args) {
  //   try {
  //     return f(...args);
  //   } catch (error) {
  //     return;
  //   }
  // }

  function prunedPermutations() {
    const permutations = permute(seed.length);

    return permutations.filter(function (perm) {
      const count = countNonZeroes(perm);

      return count !== 0 && (count === 1 || diagonals);
    });
  }

  function permute(length) {
    const perms = [];

    const permutation = function (string) {
      return string.split('').map(function (c) {
        return parseInt(c, 10) - 1;
      });
    };

    for (let i = 0; i < Math.pow(3, length); i += 1) {
      const string = lpad(i.toString(3), '0', length);

      perms.push(permutation(string));
    }

    return perms;
  }

  function boundaries() {
    const array = Array.from(bounds.values());
    array.reverse();
    return array;
  }
}

function defaultEquals(a, b) {
  return a === b;
}

function countNonZeroes(array) {
  let count = 0;

  for (let i = 0; i < array.length; i += 1) {
    if (array[i] !== 0) {
      count += 1;
    }
  }

  return count;
}

function lpad(string, character, length) {
  const array = new Array(length + 1);
  const pad = array.join(character);

  return (pad + string).slice(-length);
}

export default floodFill;
