/**
 * The size in device pixels of the box of an element: its CSS size
 * (`getBoundingClientRect()`) times the device pixel ratio, rounded to whole
 * pixels. It is the one rule by which the rendering engines size the canvas
 * of a pane, when they enable a viewport, set their viewports and resize, and
 * by which a planar viewport sizes its CPU canvas, so a pane whose CSS size
 * times the device pixel ratio is not a whole number has one canvas size on
 * every path. A rounded CSS size (`clientWidth`) differs from it by a pixel
 * there. A hidden element has no size.
 */
export default function getDevicePixelSize(element: Element): {
  width: number;
  height: number;
} {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const { width, height } = element.getBoundingClientRect();

  return {
    width: Math.round(width * devicePixelRatio),
    height: Math.round(height * devicePixelRatio),
  };
}
