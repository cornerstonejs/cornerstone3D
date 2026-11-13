import { computeSurfaceFromLabelmapSegmentation } from './surfaceComputationStrategies';
import { updateSurfaceData } from './updateSurfaceData';

jest.mock('./surfaceComputationStrategies', () => ({
  computeSurfaceFromLabelmapSegmentation: jest.fn(),
}));

const compute = computeSurfaceFromLabelmapSegmentation as jest.Mock;

describe('updateSurfaceData', () => {
  it('runs one conversion at a time, and one more pass for calls meanwhile', async () => {
    const pending = [];
    compute.mockImplementation(
      () => new Promise((resolve) => pending.push(() => resolve(undefined)))
    );

    const first = updateSurfaceData('seg');
    const second = updateSurfaceData('seg');
    const third = updateSurfaceData('seg');

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(compute).toHaveBeenCalledTimes(1);

    pending.shift()();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The calls while the first pass ran give one more pass, not two.
    expect(compute).toHaveBeenCalledTimes(2);

    pending.shift()();
    await first;
    expect(compute).toHaveBeenCalledTimes(2);

    // A call after the update ends starts a new update.
    const next = updateSurfaceData('seg');
    expect(next).not.toBe(first);
    pending.shift()();
    await next;
    expect(compute).toHaveBeenCalledTimes(3);
  });
});
