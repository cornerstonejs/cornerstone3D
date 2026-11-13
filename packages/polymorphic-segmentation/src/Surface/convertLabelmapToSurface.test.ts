import { cache, eventTarget, Enums } from '@cornerstonejs/core';
import { convertLabelmapToSurfaces } from './convertLabelmapToSurface';

const mockExecuteTask = jest.fn();

jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getWebWorkerManager: () => ({
    executeTask: (...args) => mockExecuteTask(...args),
  }),
}));

describe('convertLabelmapToSurfaces', () => {
  it('skips a block as large as one that failed, and reports both', async () => {
    const dimensions = [8, 8, 8];
    const data = new Uint8Array(512);
    data[1 * 64 + 1 * 8 + 1] = 1; // segment 1 at [1, 1, 1]
    data[5 * 64 + 5 * 8 + 5] = 2; // segment 2 at [5, 5, 5], the same block size
    data[6 * 64 + 6 * 8 + 0] = 3; // segment 3 at [0, 6, 6], a smaller block
    jest.spyOn(cache, 'getVolume').mockReturnValue({
      dimensions,
      spacing: [1, 1, 1],
      direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      voxelManager: {
        getWritableScalarData: () => data,
        getConstructor: () => Uint8Array,
      },
      imageData: { indexToWorld: (index) => index },
    } as never);
    mockExecuteTask
      .mockRejectedValueOnce(new Error('Aborted()'))
      .mockResolvedValueOnce({ points: [0, 0, 0], polys: [3, 0, 0, 0] });
    const events = [];
    const listener = ({ detail }) => events.push(detail);
    eventTarget.addEventListener(
      Enums.Events.WEB_WORKER_PROGRESS,
      listener as EventListener
    );

    const surfaces = await convertLabelmapToSurfaces(
      { volumeId: 'v' },
      [1, 2, 3]
    );

    eventTarget.removeEventListener(
      Enums.Events.WEB_WORKER_PROGRESS,
      listener as EventListener
    );
    // Segment 1 fails in the worker, segment 2 is not sent, segment 3 is smaller.
    expect(mockExecuteTask).toHaveBeenCalledTimes(2);
    expect(mockExecuteTask.mock.calls[1][2].segmentIndex).toBe(3);
    expect(surfaces[0].points).toEqual([]);
    expect(surfaces[1].points).toEqual([]);
    expect(surfaces[2].points).toEqual([0, 0, 0]);
    const failures = events.filter((detail) => detail.error);
    expect(failures.map(({ id }) => id)).toEqual([1, 2]);
    expect(failures.every(({ progress }) => progress === 100)).toBe(true);
  });
});
