import scroll from '../src/utilities/scroll';
import { jumpToSlice } from '../src/utilities/jumpToSlice';
import { Events } from '../src/enums';
import eventTarget from '../src/eventTarget';
import * as getEnabledElementModule from '../src/getEnabledElement';
import ECGViewport from '../src/RenderingEngine/Viewports/ECG/ECGViewport';
import WSIViewport from '../src/RenderingEngine/Viewports/WSI/WSIViewport';
import { mountNext, unmount } from './utils/wsiStandIn';

jest.mock('../src/getEnabledElement');

const SAMPLES = 1000;

/** A waveform of two leads. */
function makeWaveform() {
  return {
    id: 'ecg:1',
    type: 'ecg',
    channels: ['I', 'II'].map((name) => ({
      name,
      data: new Int16Array(SAMPLES),
      min: -100,
      max: 100,
      mvPerUnit: 0.001,
    })),
    numberOfChannels: 2,
    numberOfSamples: SAMPLES,
    samplingFrequency: 500,
    bitsAllocated: 16,
    sampleInterpretation: 'SS',
  };
}

/** Makes a direct next ECG viewport on a canvas of a known size. */
async function mountEcg() {
  const element = document.createElement('div');

  document.body.appendChild(element);

  const viewport = new ECGViewport({
    id: 'ecgNext',
    element,
    renderingEngineId: 'renderingEngine',
    dataProvider: { load: async () => makeWaveform() },
  });

  Object.defineProperty(viewport.canvas, 'clientWidth', { value: 800 });
  Object.defineProperty(viewport.canvas, 'clientHeight', { value: 600 });
  await viewport.setDisplaySets({ displaySetId: 'ecg:1' });

  return { viewport, element };
}

describe('Scroll on a next viewport that has no slices', () => {
  const mounted = [];
  let outOfBounds;

  /** Makes the viewport the enabled element of every element. */
  function enable(made) {
    mounted.push(made);
    jest
      .spyOn(getEnabledElementModule, 'default')
      .mockReturnValue({ viewport: made.viewport });

    return made;
  }

  beforeEach(() => {
    outOfBounds = jest.fn();
    eventTarget.addEventListener(Events.SCROLL_OUT_OF_BOUNDS, outOfBounds);
  });

  afterEach(() => {
    eventTarget.removeEventListener(Events.SCROLL_OUT_OF_BOUNDS, outOfBounds);
    mounted.splice(0).forEach(unmount);
    jest.restoreAllMocks();
  });

  it('does nothing and does not throw for utilities.scroll and jumpToSlice on a direct next whole slide viewport', async () => {
    const { viewport, view, element } = enable(
      await mountNext(WSIViewport, 0.4)
    );
    const resolution = view.getResolution();
    const center = view.getCenter();

    expect(() => scroll(viewport, { delta: 1 })).not.toThrow();
    expect(() => scroll(viewport, { delta: -2, loop: true })).not.toThrow();
    await expect(jumpToSlice(element, { imageIndex: 3 })).resolves.toBe(
      undefined
    );

    expect(view.getResolution()).toBe(resolution);
    expect(view.getCenter()).toEqual(center);
    expect(outOfBounds).not.toHaveBeenCalled();
  });

  it('moves the time window of a direct next ECG viewport for utilities.scroll, and jumpToSlice does not throw on it', async () => {
    const { viewport, element } = enable(await mountEcg());
    const ecgScroll = jest.spyOn(viewport, 'scroll');

    expect(viewport.getNumberOfSlices).toBeUndefined();

    scroll(viewport, { delta: 2, loop: true });

    expect(ecgScroll.mock.calls).toEqual([[2]]);

    await expect(jumpToSlice(element, { imageIndex: 3 })).resolves.toBe(
      undefined
    );

    expect(ecgScroll.mock.calls).toEqual([[2], [0]]);
    expect(outOfBounds).not.toHaveBeenCalled();
  });
});
