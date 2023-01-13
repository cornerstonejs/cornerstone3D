import type {
  FloodFillResult,
  FloodFillGetter,
  FloodFillOptions,
} from '../../types';
import { Types } from '@cornerstonejs/core';

/**
 * floodFill.js - Taken from MIT OSS lib - https://github.com/tuzz/n-dimensional-flood-fill
 * Refactored to ES6.
 *
 * @param {function} getter The getter to the elements of your data structure,
 *                          e.g. getter(x,y) for a 2D interprettation of your structure.
 * @param {number[]} seed The seed for your fill. The dimensionality is infered
 *                        by the number of dimensions of the seed.
 * @param {function} [options.onFlood] An optional callback to execute when each pixel is flooded.
 *                             e.g. onFlood(x,y).
 * @param {function} [options.onBoundary] An optional callback to execute whenever a boundary is reached.
 *                                a boundary could be another segmentIndex, or the edge of your
 *                                data structure (i.e. when your getter returns undefined).
 * @param {function} [options.equals] An optional equality method for your datastructure.
 *                            Default is simply value1 = value2.
 * @param {boolean} [options.diagonals] Whether you allow flooding through diagonals. Defaults to false.
 *
 * @returns {Object}
 */
function floodFill(
  getter: FloodFillGetter,
  seed: Types.Point2 | Types.Point3,
  options: FloodFillOptions = {}
): FloodFillResult {
  const onFlood = options.onFlood;
  const onBoundary = options.onBoundary;
  const equals = options.equals || defaultEquals;
  const diagonals = options.diagonals || false;
  const startNode = get(seed);
  const permutations = prunedPermutations();
  const stack = [];
  const flooded = [];
  const visits = {};
  const bounds = {};

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

  function visited(key) {
    return visits[key] === true;
  }

  function markAsVisited(key) {
    visits[key] = true;
  }

  function member(getArgs) {
    const node = safely(get, [getArgs]);

    return safely(equals, [node, startNode]);
  }

  function markAsFlooded(getArgs) {
    flooded.push(getArgs);
    if (onFlood) {
      //@ts-ignore
      onFlood(...getArgs);
    }
  }

  function markAsBoundary(prevArgs) {
    bounds[prevArgs] = prevArgs;
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

  function safely(f, args) {
    try {
      return f(...args);
    } catch (error) {
      return;
    }
  }

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
    const array = [];

    for (const key in bounds) {
      if (bounds[key] !== undefined) {
        array.unshift(bounds[key]);
      }
    }

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
