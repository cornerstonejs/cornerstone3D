/**
 * The decode workers of the loader start before the first image. The first
 * task of a decode worker is the first image of a load, and an instance that
 * the web worker manager makes for that task (its default since 6.0) loads
 * its script then, so the first images wait for it: the first frame of the
 * TMTV study reached the cache 80 ms later than on 5.18.3 in OHIF (M97), 17 ms
 * later in a page with the loader alone (lane FX24). `init` asks for every
 * instance in the first idle period after registration.
 */

const mockRegisterWorker = jest.fn();

jest.mock('@cornerstonejs/core', () => ({
  getWebWorkerManager: () => ({ registerWorker: mockRegisterWorker }),
}));

jest.mock('../imageLoader/registerLoaders', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../imageLoader/internal/index', () => ({
  setOptions: jest.fn(),
}));

import init from '../init';

describe('init of the DICOM image loader', () => {
  it('makes its decode workers when the main thread is idle, not at the first image', () => {
    init({ maxWebWorkers: 3 });

    expect(mockRegisterWorker).toHaveBeenCalledTimes(1);

    const [name, , options] = mockRegisterWorker.mock.calls[0];

    expect(name).toBe('dicomImageLoader');
    expect(options).toEqual(
      expect.objectContaining({
        maxWorkerInstances: 3,
        createInstances: 'whenIdle',
      })
    );
  });
});
