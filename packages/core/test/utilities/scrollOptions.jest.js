jest.mock('../../src/getEnabledElement', () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));

import scroll from '../../src/utilities/scroll';

/**
 * A stand-in for a generic viewport that shows `mode` content, with 3 slices
 * and the second one on display. Its scroll is a mock. With a
 * `requestedType` it is the legacy adapter that the rendering engine makes
 * for that legacy type.
 */
function createGenericViewport(mode, requestedType = 'planarNext') {
  return {
    type: mode === 'stack' || mode === 'volume' ? 'planarNext' : mode,
    requestedType,
    element: document.createElement('div'),
    getCurrentMode: () => mode,
    setDisplaySets() {},
    setDisplaySetPresentation() {},
    setViewState() {},
    getCurrentImageIdIndex: () => 1,
    getNumberOfSlices: () => 3,
    getImageIds: () => ['a', 'b', 'c'],
    scroll: jest.fn(),
  };
}

describe('scroll on a generic viewport', () => {
  it('gives the options of the scroll to a legacy adapter in volume mode', () => {
    const viewport = createGenericViewport('volume', 'orthographic');

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

  it('gives the debounce and the loop to a legacy adapter in stack mode', () => {
    const viewport = createGenericViewport('stack', 'stack');

    scroll(viewport, { delta: 1, debounceLoading: false, loop: true });

    expect(viewport.scroll).toHaveBeenCalledWith(1, false, true);
  });

  it('gives a next planar viewport in stack mode a number of images only, whatever the options', () => {
    const viewport = createGenericViewport('stack');

    scroll(viewport, {
      delta: 1,
      volumeId: 'volume-b',
      scrollSlabs: true,
      debounceLoading: false,
    });

    expect(viewport.scroll.mock.calls).toEqual([[1]]);
  });

  it('wraps a next planar viewport at both ends with loop', () => {
    const viewport = createGenericViewport('stack');

    scroll(viewport, { delta: 2, loop: true });
    scroll(viewport, { delta: -2, loop: true });
    scroll(viewport, { delta: 1, loop: true });
    scroll(viewport, { delta: 7, loop: true });

    expect(viewport.scroll.mock.calls).toEqual([[-1], [1], [1], [1]]);
  });

  it('leaves a whole slide viewport and an ECG viewport as they were', () => {
    const wholeSlide = createGenericViewport('wsi', 'wsi');
    const ecg = createGenericViewport('ecg', 'ecg');

    scroll(wholeSlide, { delta: 1, debounceLoading: false, loop: true });
    scroll(ecg, { delta: 2, loop: true });

    expect(wholeSlide.scroll.mock.calls).toEqual([[1, false, true]]);
    expect(ecg.scroll.mock.calls).toEqual([[2]]);
  });
});
