import { ToolModes } from '../../enums';
import SegmentSelectTool from './SegmentSelectTool';

// The hover-to-activate flow is debounced: a mouse move arms a timer that, once
// it fires, sets the active segment to whatever is under the (by then possibly
// stale) pointer. These tests exercise that timer's lifecycle in isolation from
// the actual segment resolution, which is stubbed out.
describe('SegmentSelectTool hover-activate timer', () => {
  let tool: SegmentSelectTool;
  let element: HTMLDivElement;
  let setActiveSpy: jest.SpyInstance;

  const move = () =>
    tool.mouseMoveCallback({
      detail: { element, currentPoints: { world: [0, 0, 0] } },
    } as never);

  beforeEach(() => {
    jest.useFakeTimers();
    tool = new SegmentSelectTool();
    // The tool only arms the timer while Active (the "hover on segment border to
    // activate" toggle is on).
    (tool as unknown as { mode: ToolModes }).mode = ToolModes.Active;
    tool.configuration.hoverTimeout = 100;
    element = document.createElement('div');
    setActiveSpy = jest
      .spyOn(
        tool as unknown as { _setActiveSegment: () => void },
        '_setActiveSegment'
      )
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('activates the hovered segment after hoverTimeout while the pointer stays (feature preserved)', () => {
    move();
    jest.advanceTimersByTime(100);
    expect(setActiveSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending hover activation once the pointer leaves the viewport, so it cannot override a later selection (bug fix)', () => {
    move(); // last hover over the viewport arms the debounced timer
    // Pointer moves off the viewport, e.g. to the segmentation panel to click a
    // different segment. Without the fix the stale timer still fires ~100ms later
    // and reverts the active segment to whatever the pointer last hovered.
    element.dispatchEvent(new Event('mouseleave'));
    jest.advanceTimersByTime(200);
    expect(setActiveSpy).not.toHaveBeenCalled();
  });

  // Toggling the hover feature off (keyboard shortcut, panel switch) moves the
  // tool out of Active without the pointer ever leaving the viewport, so there is
  // no mouseleave to lean on - the mode change itself has to drop the timer.
  it.each([
    ['passive', () => tool.onSetToolPassive()],
    ['enabled', () => tool.onSetToolEnabled()],
    ['disabled', () => tool.onSetToolDisabled()],
  ])('cancels the pending hover activation when set %s', (_mode, setMode) => {
    move();
    setMode();
    jest.advanceTimersByTime(200);
    expect(setActiveSpy).not.toHaveBeenCalled();
  });

  it('does not arm the timer when the tool is not Active (hover toggle off)', () => {
    (tool as unknown as { mode: ToolModes }).mode = ToolModes.Passive;
    move();
    jest.advanceTimersByTime(200);
    expect(setActiveSpy).not.toHaveBeenCalled();
  });
});
