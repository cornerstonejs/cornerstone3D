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

function makeAdapter(mode, requestedType, extra = {}) {
  return {
    ...nextApi(),
    type: 'planarNext',
    requestedType,
    element: document.createElement('div'),
    getCurrentMode: () => mode,
    ...extra,
  };
}

function makeLegacy(type, extra = {}) {
  return {
    type,
    requestedType: type,
    element: document.createElement('div'),
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
      const viewport = makeAdapter('volume', 'orthographic', {
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

    it('scrolls a volume-mode adapter through its scroll, with the volume options', () => {
      const viewport = useViewport(
        makeAdapter('volume', 'orthographic', {
          getCurrentImageIdIndex: () => 2,
          getImageIds: () => ['a', 'b', 'c', 'd'],
          scroll: jest.fn(),
        })
      );

      scroll(viewport, { delta: 1, volumeId: 'ct' });

      expect(viewport.scroll).toHaveBeenCalledWith(1, undefined, undefined, {
        volumeId: 'ct',
        scrollSlabs: undefined,
      });
    });
  });

  describe('jumpToSlice', () => {
    it('uses the target index of a legacy stack viewport when debouncing', async () => {
      const viewport = useViewport(
        makeLegacy('stack', {
          getImageIds: () => ['a', 'b', 'c', 'd'],
          getTargetImageIdIndex: () => 3,
          getCurrentImageIdIndex: () => 0,
          scroll: jest.fn(),
        })
      );

      await jumpToSlice(viewport.element, {
        imageIndex: 1,
        debounceLoading: true,
      });

      expect(viewport.scroll).toHaveBeenCalledWith(-2, true, undefined);
    });

    it('uses the slice index of a stack-mode adapter, as before', async () => {
      const viewport = useViewport(
        makeAdapter('stack', 'stack', {
          getImageIds: () => ['a', 'b', 'c', 'd'],
          getNumberOfSlices: () => 4,
          getSliceIndex: () => 0,
          getCurrentImageIdIndex: () => 0,
          scroll: jest.fn(),
        })
      );

      await jumpToSlice(viewport.element, {
        imageIndex: 1,
        debounceLoading: true,
      });

      expect(viewport.scroll).toHaveBeenCalledWith(1, true, undefined);
    });

    ['stack', 'volume'].forEach((mode) => {
      it(`reads the current image index of a direct next viewport in ${mode} mode`, async () => {
        const viewport = useViewport(
          makeAdapter(mode, 'planarNext', {
            getImageIds: () => ['a', 'b', 'c', 'd'],
            getNumberOfSlices: () => 4,
            getCurrentImageIdIndex: () => 3,
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
