import scroll from '../src/utilities/scroll';
import { Events } from '../src/enums';
import { SpeedUnit } from '../src/enums/VideoEnums';
import eventTarget from '../src/eventTarget';
import * as getEnabledElementModule from '../src/getEnabledElement';

jest.mock('../src/getEnabledElement');

/** The number of frames of the stand-in video. */
const FRAMES = 20;

/**
 * A video viewport that an application registered: it reports video
 * content and has the members of a scroll by frames, but no `getFrameRate`,
 * which the registration contract does not ask for.
 */
function makeCustomVideo({ imageIdIndex = 3, viewState = {}, fps } = {}) {
  const viewport = {
    id: 'customVideo',
    element: document.createElement('div'),
    getCurrentMode: () => 'video',
    getViewState: () => viewState,
    getImageIds: () =>
      Array.from({ length: FRAMES }, (_, frame) => `video:1?frame=${frame}`),
    getCurrentImageIdIndex: () => imageIdIndex,
    scroll: jest.fn(),
  };

  if (fps !== undefined) {
    viewport.getFrameRate = () => fps;
  }

  jest.spyOn(getEnabledElementModule, 'default').mockReturnValue({ viewport });

  return viewport;
}

describe('utilities.scroll on a registered video viewport', () => {
  let outOfBounds;

  beforeEach(() => {
    outOfBounds = jest.fn();
    eventTarget.addEventListener(
      Events.STACK_SCROLL_OUT_OF_BOUNDS,
      outOfBounds
    );
  });

  afterEach(() => {
    eventTarget.removeEventListener(
      Events.STACK_SCROLL_OUT_OF_BOUNDS,
      outOfBounds
    );
    jest.restoreAllMocks();
  });

  it('scrolls by one frame a viewport without getFrameRate', () => {
    const viewport = makeCustomVideo();

    expect(() => scroll(viewport, { delta: 1 })).not.toThrow();
    expect(viewport.scroll.mock.calls).toEqual([[1, undefined, undefined]]);
    expect(outOfBounds).not.toHaveBeenCalled();
  });

  it('takes a step in frames without reading a frame rate', () => {
    const viewport = makeCustomVideo({
      imageIdIndex: 15,
      viewState: { scrollStep: { value: 5, unit: SpeedUnit.FRAME } },
    });

    expect(() => scroll(viewport, { delta: 1 })).not.toThrow();
    expect(viewport.scroll).toHaveBeenCalledTimes(1);
    expect(outOfBounds).toHaveBeenCalledTimes(1);
  });

  it('takes one frame per step for a step in seconds on a viewport without getFrameRate', () => {
    const viewport = makeCustomVideo({
      imageIdIndex: FRAMES - 2,
      viewState: { scrollStep: { value: 2, unit: SpeedUnit.SECOND } },
    });

    expect(() => scroll(viewport, { delta: 1 })).not.toThrow();
    expect(viewport.scroll).toHaveBeenCalledTimes(1);
    expect(outOfBounds).not.toHaveBeenCalled();
  });

  it('reads the frame rate for a step in seconds on a viewport that has getFrameRate', () => {
    const viewport = makeCustomVideo({
      viewState: { scrollStep: { value: 1, unit: SpeedUnit.SECOND } },
      fps: 30,
    });

    scroll(viewport, { delta: 1 });

    expect(viewport.scroll).toHaveBeenCalledTimes(1);
    expect(outOfBounds).toHaveBeenCalledTimes(1);
  });
});
