jest.mock('../../src/getEnabledElement', () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));

import scroll from '../../src/utilities/scroll';

/**
 * A stand-in for a generic viewport that shows `mode` content, with 3 slices
 * and the second one on display. Its scroll and its setImageIdIndex are
 * mocks.
 */
function createViewport(mode) {
  return {
    type: mode === 'stack' || mode === 'volume' ? 'planar' : mode,
    element: document.createElement('div'),
    getCurrentMode: () => mode,
    setDisplaySets() {},
    setDisplaySetAppearance() {},
    setViewState() {},
    getCurrentImageIdIndex: () => 1,
    getCurrentImageId: () => 'b',
    getNumberOfSlices: () => 3,
    getImageIds: () => ['a', 'b', 'c'],
    setImageIdIndex: jest.fn(() => Promise.resolve('b')),
    scroll: jest.fn(),
  };
}

describe('scroll on a generic viewport', () => {
  it('gives a next planar viewport in stack mode a number of images only, whatever the options', () => {
    const viewport = createViewport('stack');

    scroll(viewport, {
      delta: 1,
      volumeId: 'volume-b',
      scrollSlabs: true,
      debounceLoading: false,
    });

    expect(viewport.setImageIdIndex.mock.calls).toEqual([[2]]);
  });

  it('wraps a next planar viewport at both ends with loop', () => {
    const viewport = createViewport('stack');

    scroll(viewport, { delta: 2, loop: true });
    scroll(viewport, { delta: -2, loop: true });
    scroll(viewport, { delta: 1, loop: true });
    scroll(viewport, { delta: 7, loop: true });

    expect(viewport.setImageIdIndex.mock.calls).toEqual([[0], [2], [2], [2]]);
  });

  it('moves a planar viewport with nothing mounted by its own setImageIdIndex, not by a scroll that calls back', () => {
    const viewport = {
      ...createViewport('empty'),
      type: 'planar',
      getNumberOfSlices: () => 0,
      getImageIds: () => [],
    };

    scroll(viewport, { delta: 1 });

    expect(viewport.setImageIdIndex.mock.calls).toEqual([[2]]);
    expect(viewport.scroll).not.toHaveBeenCalled();
  });

  it('leaves a whole slide viewport and an ECG viewport as they were', () => {
    const wholeSlide = createViewport('wsi');
    const ecg = createViewport('ecg');

    scroll(wholeSlide, { delta: 1, debounceLoading: false, loop: true });
    scroll(ecg, { delta: 2, loop: true });

    expect(wholeSlide.scroll.mock.calls).toEqual([[1, false, true]]);
    expect(ecg.scroll.mock.calls).toEqual([[2]]);
  });
});
