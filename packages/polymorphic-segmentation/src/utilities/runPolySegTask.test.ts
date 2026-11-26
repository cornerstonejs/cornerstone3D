import { convertContourToSurface } from '../Surface/convertContourToSurface';
import { runPolySegTask } from './runPolySegTask';

/** The tasks sent to the worker, each with the function that answers it. */
const mockSent = [];

/** The instances of the polySeg worker. */
const mockInstances = [{}];

/** The contour annotations of the segments, by annotation UID. */
const mockAnnotations = {
  contour: {
    data: {
      contour: {
        closed: true,
        polyline: [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
        ],
      },
    },
  },
};

jest.mock('@cornerstonejs/core', () => ({
  Enums: { Events: { WEB_WORKER_PROGRESS: 'WEB_WORKER_PROGRESS' } },
  eventTarget: {},
  triggerEvent: jest.fn(),
  getWebWorkerManager: () => ({
    get workerRegistry() {
      return { polySeg: { instances: mockInstances } };
    },
    executeTask: (worker, task) =>
      new Promise((resolve) => mockSent.push({ task, answer: resolve })),
  }),
}));
jest.mock('@cornerstonejs/tools', () => ({
  Enums: { WorkerTypes: { POLYSEG_CONTOUR_TO_SURFACE: 'contourToSurface' } },
  annotation: {
    state: { getAnnotation: (annotationUID) => mockAnnotations[annotationUID] },
  },
}));

const contours = {
  annotationUIDsMap: new Map([
    [1, new Set(['contour'])],
    [2, new Set(['contour'])],
    [3, new Set(['contour'])],
  ]),
} as never;

function nextTask() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Answers the task sent at this index, and waits for the next one to go. */
async function answer(index) {
  mockSent[index].answer({ points: [], polys: [] });
  await nextTask();
  await nextTask();
}

describe('runPolySegTask', () => {
  beforeEach(() => {
    mockSent.length = 0;
    mockInstances.length = 1;
  });

  it('sends one conversion per instance of the worker at a time, in the order asked', async () => {
    const conversions = [1, 2, 3].map((segmentIndex) =>
      convertContourToSurface(contours, segmentIndex)
    );

    await nextTask();
    expect(mockSent.length).toBe(1);

    await answer(0);
    expect(mockSent.length).toBe(2);

    await answer(1);
    await answer(2);
    await Promise.all(conversions);
    expect(mockSent.map(({ task }) => task)).toEqual([
      'convertContourToSurface',
      'convertContourToSurface',
      'convertContourToSurface',
    ]);
  });

  it('sends as many tasks at a time as the worker has instances', async () => {
    mockInstances.push({});
    const conversions = [1, 2, 3].map((segmentIndex) =>
      convertContourToSurface(contours, segmentIndex)
    );

    await nextTask();
    expect(mockSent.length).toBe(2);

    await answer(0);
    expect(mockSent.length).toBe(3);

    await answer(1);
    await answer(2);
    await Promise.all(conversions);
  });

  it('sends an urgent task before the conversions that wait', async () => {
    const conversions = [1, 2, 3].map((segmentIndex) =>
      convertContourToSurface(contours, segmentIndex)
    );

    await nextTask();

    const cut = runPolySegTask(
      () =>
        new Promise((resolve) =>
          mockSent.push({ task: 'cutSurfacesIntoPlanes', answer: resolve })
        ),
      true
    );

    await answer(0);
    expect(mockSent.map(({ task }) => task)).toEqual([
      'convertContourToSurface',
      'cutSurfacesIntoPlanes',
    ]);

    await answer(1);
    await answer(2);
    await answer(3);
    await Promise.all([...conversions, cut]);
    expect(mockSent.length).toBe(4);
  });
});
