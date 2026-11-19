jest.mock('../src/getEnabledElement', () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}));

import cache from '../src/cache/cache';
import getViewportImageIds from '../src/utilities/getViewportImageIds';
import scroll from '../src/utilities/scroll';
import { jumpToSlice } from '../src/utilities/jumpToSlice';
import getEnabledElement from '../src/getEnabledElement';

function nextApi() {
  return {
    setDisplaySets: jest.fn(),
    setDisplaySetPresentation: jest.fn(),
    setViewState: jest.fn(),
  };
}

function makeAdapter(mode, extra = {}) {
  return {
    ...nextApi(),
    type: 'planar',
    element: document.createElement('div'),
    getCurrentMode: () => mode,
    ...extra,
  };
}

/**
 * A stand-in for a legacy viewport: it has no next API, and it says the mode
 * of its content through `getCurrentMode`.
 */
function makeLegacy(mode, extra = {}) {
  return {
    element: document.createElement('div'),
    getCurrentMode: () => mode,
    ...extra,
  };
}

function useViewport(viewport) {
  getEnabledElement.mockReturnValue({ viewport });

  return viewport;
}

describe('legacy viewport utilities on legacy viewports and legacy adapters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getEnabledElement.mockReturnValue({});
  });

  describe('getViewportImageIds', () => {
    it('keeps asking a volume-mode adapter for its image ids', () => {
      const getVolume = jest.spyOn(cache, 'getVolume');
      const viewport = makeAdapter('volume', {
        getVolumeId: () => 'ct',
        getImageIds: () => ['c', 'd'],
      });

      expect(getViewportImageIds(viewport)).toEqual(['c', 'd']);
      expect(getVolume).not.toHaveBeenCalled();
      getVolume.mockRestore();
    });
  });

  describe('scroll', () => {
    it('throws for a legacy stack viewport without images', () => {
      const viewport = useViewport(
        makeLegacy('stack', { getImageIds: () => [] })
      );

      expect(() => scroll(viewport, { delta: 1 })).toThrow(
        'Scroll::Stack Viewport has no images'
      );
    });
  });

  describe('jumpToSlice', () => {
    ['stack', 'volume'].forEach((mode) => {
      it(`reads the current image index of a direct next viewport in ${mode} mode`, async () => {
        const viewport = useViewport(
          makeAdapter(mode, {
            getImageIds: () => ['a', 'b', 'c', 'd'],
            getNumberOfSlices: () => 4,
            getCurrentImageIdIndex: () => 3,
            getCurrentImageId: () => 'd',
            scroll: jest.fn(),
          })
        );

        await jumpToSlice(viewport.element, {
          imageIndex: 1,
          debounceLoading: true,
        });

        expect(viewport.scroll.mock.calls[0][0]).toBe(-2);
      });
    });
  });
});
