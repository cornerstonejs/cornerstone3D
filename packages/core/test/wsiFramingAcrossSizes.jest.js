import { describe, it, expect, afterEach } from '@jest/globals';
import WSIViewport from '../src/RenderingEngine/Viewports/WSI/WSIViewport';
import { HEIGHT, WIDTH, mountNext, unmount } from './utils/wsiStandIn';

const mounted = [];

afterEach(() => {
  mounted.splice(0).forEach(unmount);
});

function expectClose(actual, expected, context, precision = 3) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect([context, index, value]).toEqual([
      context,
      index,
      expect.closeTo(expected[index], precision),
    ])
  );
}

/** Gives the element and its canvas a size in CSS pixels. */
function setSize(element, width, height) {
  const canvas = element.querySelector('canvas');

  element.clientWidth = width;
  element.clientHeight = height;
  canvas.clientWidth = width;
  canvas.clientHeight = height;
}

/** Mounts the slide on a viewport of the given size. */
async function mountOfSize(width, height) {
  const made = await mountNext(WSIViewport);

  mounted.push(made);
  setSize(made.element, width, height);
  made.viewport.resize();

  return made;
}

/** The slide point at the centre of the canvas of a mounted viewport. */
function centreOf({ viewport, element }) {
  return viewport.canvasToWorld([
    element.clientWidth / 2,
    element.clientHeight / 2,
  ]);
}

const FRAMING = { pan: [40, 20], zoom: 1.5 };

describe('The framing of a direct next whole slide viewport across sizes', () => {
  it('gives a viewport of half the size the same zoom against its fit and the same slide point at the centre', async () => {
    const large = await mountOfSize(WIDTH, HEIGHT);
    const small = await mountOfSize(WIDTH / 2, HEIGHT / 2);

    large.viewport.setViewFraming(FRAMING);
    small.viewport.setViewFraming(large.viewport.getViewFraming());

    const framing = small.viewport.getViewFraming();

    expect(framing.zoom).toBeCloseTo(FRAMING.zoom, 6);
    expectClose(
      framing.worldPan,
      large.viewport.getViewFraming().worldPan,
      'world pan'
    );
    expectClose(framing.pan, [FRAMING.pan[0] / 2, FRAMING.pan[1] / 2], 'pan');
    expectClose(centreOf(small), centreOf(large), 'centre');
  });

  it('keeps the slide point at the centre through a resize to half the size and a framing written back to a viewport of the first size, with the zoom read after the resize, as a resize keeps the resolution of the map', async () => {
    const first = await mountOfSize(WIDTH, HEIGHT);

    first.viewport.setViewFraming(FRAMING);

    const start = first.viewport.getViewFraming();
    const startCentre = centreOf(first);

    setSize(first.element, WIDTH / 2, HEIGHT / 2);
    first.viewport.resize();

    const halved = first.viewport.getViewFraming();

    expectClose(halved.worldPan, start.worldPan, 'world pan after the resize');
    expectClose(centreOf(first), startCentre, 'centre after the resize');
    expect(halved.zoom).toBeCloseTo(start.zoom * 2, 6);

    const back = await mountOfSize(WIDTH, HEIGHT);

    back.viewport.setViewFraming(halved);

    const framing = back.viewport.getViewFraming();

    expect(framing.zoom).toBeCloseTo(halved.zoom, 6);
    expectClose(framing.worldPan, start.worldPan, 'world pan back');
    expectClose(centreOf(back), startCentre, 'centre back');
  });

  it('keeps the resolution of the map and the slide point at the centre through a resize with keepCamera false, which turns the view back to the rotation of the slide and fits nothing', async () => {
    const first = await mountOfSize(WIDTH, HEIGHT);

    first.viewport.setViewFraming(FRAMING);

    const start = first.viewport.getViewFraming();
    const resolution = first.view.getResolution();
    const startCentre = centreOf(first);

    setSize(first.element, WIDTH / 2, HEIGHT / 2);
    first.viewport.resizeForRenderingEngine({ keepCamera: false });

    expect(first.view.getResolution()).toBeCloseTo(resolution, 6);
    expect(first.viewport.getViewFraming().zoom).toBeCloseTo(start.zoom * 2, 6);
    expectClose(centreOf(first), startCentre, 'centre after the resize');

    first.viewport.setViewState({ rotation: 30 });
    first.viewport.resizeForRenderingEngine({ keepCamera: false });

    expect(first.viewport.getViewState().rotation).toBe(0);
  });
});
