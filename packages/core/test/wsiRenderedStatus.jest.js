import { describe, it, expect, afterEach, jest } from '@jest/globals';
import WSIViewport from '../src/RenderingEngine/Viewports/WSI/WSIViewport';
import BaseViewport from '../src/RenderingEngine/Viewports/BaseViewport';
import { Events, ViewportStatus } from '../src/enums';
import { mountNext, unmount } from './utils/wsiStandIn';

const mounted = [];

afterEach(() => {
  mounted.splice(0).forEach(unmount);
  jest.restoreAllMocks();
});

async function mount() {
  const made = await mountNext(WSIViewport);

  mounted.push(made);

  return made;
}

describe('The rendered status of a direct next whole slide viewport', () => {
  it('is rendered when the map has drawn the tiles of its view, and an IMAGE_RENDERED fires for each frame', async () => {
    const { viewport, element, map } = await mount();
    const frames = [];

    element.addEventListener(Events.IMAGE_RENDERED, () =>
      frames.push(viewport.viewportStatus)
    );

    expect(viewport.viewportStatus).toBe(ViewportStatus.PRE_RENDER);

    map.dispatch('postrender');

    expect(frames).toEqual([ViewportStatus.PRE_RENDER]);
    expect(viewport.viewportStatus).toBe(ViewportStatus.PRE_RENDER);

    map.dispatch('rendercomplete');

    expect(viewport.viewportStatus).toBe(ViewportStatus.RENDERED);

    map.dispatch('postrender');

    expect(frames).toEqual([
      ViewportStatus.PRE_RENDER,
      ViewportStatus.RENDERED,
    ]);
  });

  it('waits for the map after a pass of the rendering engine, which only asks the map to draw', async () => {
    const { viewport, map } = await mount();

    map.dispatch('rendercomplete');
    viewport.viewportStatus = ViewportStatus.NEEDS_RENDER;
    viewport.customRenderViewportToCanvas();
    viewport.setRendered();

    expect(viewport.viewportStatus).toBe(ViewportStatus.NEEDS_RENDER);

    map.dispatch('rendercomplete');

    expect(viewport.viewportStatus).toBe(ViewportStatus.RENDERED);
  });

  it('keeps the canvas size of the framing as every family does when it has drawn', async () => {
    const setRendered = jest.spyOn(BaseViewport.prototype, 'setRendered');
    const { map } = await mount();

    expect(setRendered).not.toHaveBeenCalled();

    map.dispatch('rendercomplete');

    expect(setRendered).toHaveBeenCalledTimes(1);
  });

  it('no longer listens to the map once the viewport is destroyed', async () => {
    const { viewport, element, map } = await mount();
    const frames = [];

    element.addEventListener(Events.IMAGE_RENDERED, () => frames.push(1));
    viewport.destroy();

    const setRendered = jest.spyOn(BaseViewport.prototype, 'setRendered');

    map.dispatch('postrender');
    map.dispatch('rendercomplete');

    expect(frames).toEqual([]);
    expect(setRendered).not.toHaveBeenCalled();
  });
});
