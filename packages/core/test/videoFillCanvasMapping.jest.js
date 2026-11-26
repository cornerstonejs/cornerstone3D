import { describe, it, expect } from '@jest/globals';
import {
  createDefaultVideoViewState,
  getAnchorWorldForPan,
  getPanForVideoCanvasMapping,
  resolveVideoCanvasMapping,
} from '../src/RenderingEngine/Viewports/Video/videoViewportCamera';
import VideoResolvedView from '../src/RenderingEngine/Viewports/Video/VideoResolvedView';

const PANE = { containerWidth: 400, containerHeight: 200 };
const VIDEO = { intrinsicWidth: 100, intrinsicHeight: 100 };

function resolvedView(viewState = createDefaultVideoViewState()) {
  return new VideoResolvedView({
    viewState,
    ...PANE,
    ...VIDEO,
    objectFit: 'fill',
  });
}

describe('The canvas mapping of a video with the object fit fill', () => {
  it('maps each axis with its own ratio, so the corners of the video are the corners of the pane', () => {
    const mapping = resolveVideoCanvasMapping({
      ...PANE,
      ...VIDEO,
      objectFit: 'fill',
    });

    expect(mapping.left).toBeCloseTo(0, 6);
    expect(mapping.top).toBeCloseTo(0, 6);
    expect(mapping.worldToCanvasRatio).toBeCloseTo(4, 6);
    expect(mapping.worldToCanvasRatioY).toBeCloseTo(2, 6);
  });

  it('takes a world point to the canvas point that the stretched video shows it at, and back', () => {
    const view = resolvedView();

    expect(view.worldToCanvas([100, 100, 0])).toEqual([400, 200]);
    expect(view.worldToCanvas([50, 25, 0])).toEqual([200, 50]);
    expect(view.canvasToWorld([400, 200])).toEqual([100, 100, 0]);
    expect(view.canvasToWorld([100, 150])).toEqual([25, 75, 0]);
  });

  it('keeps a pan of the view along the height in world units of the height', () => {
    const mapping = resolveVideoCanvasMapping({
      ...PANE,
      ...VIDEO,
      objectFit: 'fill',
    });
    const pan = getPanForVideoCanvasMapping(mapping);

    expect(pan).toEqual([0, 0]);
    expect(getAnchorWorldForPan([0, 10], mapping)).toEqual([50, 40]);

    const panned = resolvedView({
      ...createDefaultVideoViewState(),
      anchorWorld: getAnchorWorldForPan([0, 10], mapping),
    });

    expect(panned.worldToCanvas([0, 0, 0])).toEqual([0, 20]);
  });

  it('keeps one ratio for the other object fits', () => {
    const mapping = resolveVideoCanvasMapping({
      ...PANE,
      ...VIDEO,
      objectFit: 'contain',
    });

    expect(mapping.worldToCanvasRatioY).toBe(mapping.worldToCanvasRatio);
  });
});
