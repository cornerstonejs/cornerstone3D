jest.mock('../../src/getEnabledElement', () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));

import scroll from '../../src/utilities/scroll';

/**
 * A generic viewport in volume mode whose scroll is a mock.
 */
function createGenericVolumeViewport() {
  return {
    element: document.createElement('div'),
    getCurrentMode: () => 'volume',
    setDisplaySets() {},
    setDisplaySetPresentation() {},
    setViewState() {},
    getCurrentImageIdIndex: () => 1,
    getImageIds: () => ['a', 'b', 'c'],
    scroll: jest.fn(),
  };
}

describe('scroll on a generic viewport', () => {
  it('gives the volume options of the scroll to the viewport', () => {
    const viewport = createGenericVolumeViewport();

    scroll(viewport, {
      delta: 1,
      volumeId: 'volume-b',
      scrollSlabs: true,
      debounceLoading: false,
      loop: true,
    });

    expect(viewport.scroll).toHaveBeenCalledWith(1, false, true, {
      volumeId: 'volume-b',
      scrollSlabs: true,
    });
  });
});
