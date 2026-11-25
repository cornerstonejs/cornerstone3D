import { describe, it, expect, afterEach } from '@jest/globals';
import WSIViewport from '../src/RenderingEngine/Viewports/WSI/WSIViewport';
import { HEIGHT, WIDTH, mountNext, unmount } from './utils/wsiStandIn';

const mounted = [];

afterEach(() => {
  mounted.splice(0).forEach(unmount);
});

function expectClose(actual, expected, precision = 3) {
  expect(actual.length).toBe(expected.length);
  actual.forEach((value, index) =>
    expect(value).toBeCloseTo(expected[index], precision)
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

const NO_SIZES = [
  { name: 'no size', size: [0, 0] },
  { name: 'a width of zero', size: [0, HEIGHT] },
];

describe('The framing of a direct next whole slide viewport whose element has no size', () => {
  NO_SIZES.forEach(({ name, size }) => {
    it(`with ${name}, is the framing of the view, takes one, and restores its pan`, async () => {
      const made = await mountNext(WSIViewport, 0.4);

      mounted.push(made);

      const { viewport, element } = made;

      viewport.setViewFraming({ pan: [40, 20], zoom: 1.5 });

      const visible = viewport.getViewFraming();

      setSize(element, ...size);

      const framing = viewport.getViewFraming();

      expect(framing.zoom).toBeCloseTo(visible.zoom, 6);
      expectClose(framing.pan, visible.pan);

      viewport.setViewFraming({ pan: [0, 0], zoom: 1 });
      viewport.setViewFraming(framing);

      expect(viewport.getViewFraming().zoom).toBeCloseTo(visible.zoom, 6);
      expectClose(viewport.getViewFraming().pan, visible.pan);

      setSize(element, WIDTH, HEIGHT);
      viewport.resetViewState();
      viewport.setViewFraming(framing);

      expect(viewport.getViewFraming().zoom).toBeCloseTo(visible.zoom, 6);
      expectClose(viewport.getViewFraming().pan, visible.pan);
    });
  });
});
