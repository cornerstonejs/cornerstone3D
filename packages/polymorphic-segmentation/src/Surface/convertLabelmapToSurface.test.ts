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
  afterEach(() => jest.restoreAllMocks());

  it('gives no surface for a failed segment, reports it, and still converts the rest', async () => {
    const dimensions = [8, 8, 8];
    const data = new Uint8Array(512);
    data[1 * 64 + 1 * 8 + 1] = 1; // segment 1 at [1, 1, 1]
    data[5 * 64 + 5 * 8 + 5] = 2; // segment 2 at [5, 5, 5], the same block size
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
    // A small block cannot fill the heap, so its failure does not lower the limit.
    expect(mockExecuteTask).toHaveBeenCalledTimes(2);
    expect(surfaces[0]).toBeUndefined();
    expect(surfaces[1].points).toEqual([0, 0, 0]);
    expect(surfaces[2]).toEqual({ points: [], polys: [] });
    const failures = events.filter((detail) => detail.error);
    expect(failures.map(({ id, progress }) => [id, progress])).toEqual([
      [1, 100],
    ]);
  });
});
