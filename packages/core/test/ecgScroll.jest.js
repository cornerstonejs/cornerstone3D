import scroll from '../src/utilities/scroll';
import { Events } from '../src/enums';
import eventTarget from '../src/eventTarget';
import * as getEnabledElementModule from '../src/getEnabledElement';

jest.mock('../src/getEnabledElement');

describe('scroll utility — ECG viewport handling and bounds checks', () => {
  const dummyElement = document.createElement('div');
  let triggerSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    triggerSpy = jest.fn();
    eventTarget.addEventListener(Events.STACK_SCROLL_OUT_OF_BOUNDS, triggerSpy);
  });

  afterEach(() => {
    eventTarget.removeEventListener(
      Events.STACK_SCROLL_OUT_OF_BOUNDS,
      triggerSpy
    );
  });

  it('throws an error when the viewport is disabled (getEnabledElement returns undefined)', () => {
    jest.spyOn(getEnabledElementModule, 'default').mockReturnValue(undefined);

    const viewport = {
      element: dummyElement,
      getCurrentMode: () => 'ecg',
      scroll: jest.fn(),
    };

    expect(() => {
      scroll(viewport, { delta: 1 });
    }).toThrow('Scroll::Viewport is not enabled');
    expect(viewport.scroll).not.toHaveBeenCalled();
  });

  it('delegates to viewport.scroll(delta) and bypasses stack bounds checks when getCurrentMode() is "ecg"', () => {
    jest
      .spyOn(getEnabledElementModule, 'default')
      .mockReturnValue({ viewport: {} });

    const scrollMock = jest.fn();
    const ecgViewport = {
      element: dummyElement,
      getCurrentMode: () => 'ecg',
      getCurrentImageIdIndex: () => 0,
      getImageIds: () => ['ecg-instance-1'], // Single imageId
      scroll: scrollMock,
    };

    scroll(ecgViewport, { delta: 1 });

    expect(scrollMock).toHaveBeenCalledTimes(1);
    expect(scrollMock).toHaveBeenCalledWith(1);
    // Crucial check: STACK_SCROLL_OUT_OF_BOUNDS must NOT be triggered
    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it('fires STACK_SCROLL_OUT_OF_BOUNDS for standard non-ECG stack viewports when out of bounds', () => {
    jest
      .spyOn(getEnabledElementModule, 'default')
      .mockReturnValue({ viewport: {} });

    const stackScrollMock = jest.fn();
    const stackViewport = {
      element: dummyElement,
      getCurrentMode: () => 'stack',
      getCurrentImageIdIndex: () => 0,
      getImageIds: () => ['slice-1'],
      scroll: stackScrollMock,
    };

    // delta = 1 with only 1 image (index 0) is out of bounds
    scroll(stackViewport, { delta: 1 });

    expect(triggerSpy).toHaveBeenCalledTimes(1);
    expect(stackScrollMock).toHaveBeenCalledWith(1, undefined, undefined);
  });
});
