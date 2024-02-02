import { LivewireScissors } from '../../../src/utilities/livewire/LivewireScissors';

import { describe, it, expect } from '@jest/globals';

const width = 256;
const height = 256;
const grayscaleGradient = new Uint8Array(width * height);
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const index = x + y * width;
    const value = (x + y) % 128;
    grayscaleGradient[index] = value;
  }
}

describe('LivewireScissors:', function () {
  it('Should find a contour path along the contour line', () => {
    const scissors = new LivewireScissors(grayscaleGradient, width, height);
    scissors.startSearch([0, 2]);
    const path = scissors.findPathToPoint([2, 0]);
    expect(path.length).toBe(3);
    expect(path[0]).toEqual([0, 2]);
    expect(path[1]).toEqual([1, 1]);
    expect(path[2]).toEqual([2, 0]);
  });

  it('Should find central point for minNearby', () => {
    const scissors = new LivewireScissors(grayscaleGradient, width, height);
    const nearby = scissors.findMinNearby([4, 4], 3);
    expect(nearby).toEqual([4, 4]);
  });
});
