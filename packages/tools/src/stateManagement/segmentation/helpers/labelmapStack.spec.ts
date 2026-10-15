jest.mock('@cornerstonejs/core', () => ({
  cache: {
    getVolume: jest.fn(),
  },
}));

import { getViewportStackId, isLabelmapStackOnViewport } from './labelmapStack';

const { cache } = jest.requireMock('@cornerstonejs/core');

const DYNAMIC_VOLUME_ID = 'dynamic-pt';
const CT_VOLUME_ID = 'ct';

const volumes = {
  [DYNAMIC_VOLUME_ID]: {
    isDynamicVolume: () => true,
    dimensionGroupNumber: 3,
  },
  [CT_VOLUME_ID]: { isDynamicVolume: () => false },
};

const viewportWith = (...volumeIds: string[]) =>
  ({
    getActors: () => volumeIds.map((referencedId) => ({ referencedId })),
  }) as never;

describe('labelmap stacks', () => {
  beforeEach(() => {
    cache.getVolume.mockImplementation((volumeId) => volumes[volumeId]);
  });

  it('gives the time point of the dynamic volume as the stack id', () => {
    expect(
      getViewportStackId(viewportWith(CT_VOLUME_ID, DYNAMIC_VOLUME_ID))
    ).toBe('3');
    expect(getViewportStackId(viewportWith(CT_VOLUME_ID))).toBeUndefined();
  });

  it('shows a labelmap of one time point only on that time point', () => {
    const viewport = viewportWith(DYNAMIC_VOLUME_ID);

    expect(isLabelmapStackOnViewport(viewport, { stackId: '3' })).toBe(true);
    expect(isLabelmapStackOnViewport(viewport, { stackId: '4' })).toBe(false);
    expect(isLabelmapStackOnViewport(viewport, {})).toBe(true);
    expect(
      isLabelmapStackOnViewport(viewportWith(CT_VOLUME_ID), { stackId: '4' })
    ).toBe(true);
  });
});
