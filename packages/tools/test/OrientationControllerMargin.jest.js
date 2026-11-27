import { vtkOrientationControllerWidget } from '../src/utilities/vtkjs/OrientationControllerWidget';
import { BOUNDING_RADIUS } from '../src/utilities/vtkjs/RhombicuboctahedronSource';

// canvasToWorld returns the canvas point, so the result is in canvas pixels.
const viewport = (width, height) => ({
  canvas: { clientWidth: width, clientHeight: height },
  canvasToWorld: ([x, y]) => [x, y, 0],
});

describe('orientation controller margin', () => {
  const widget = new vtkOrientationControllerWidget();
  const sizePx = 20;
  const offset = BOUNDING_RADIUS * sizePx + 8;

  it('keeps the margin between the controller and the corner edges', () => {
    expect(
      widget.calculateMarkerPosition(
        viewport(800, 600),
        'bottom-right',
        sizePx,
        8
      )
    ).toEqual([800 - offset, 600 - offset, 0]);
    expect(
      widget.calculateMarkerPosition(viewport(800, 600), 'top-left', sizePx, 8)
    ).toEqual([offset, offset, 0]);
  });

  it('keeps the center inside a small viewport', () => {
    expect(
      widget.calculateMarkerPosition(
        viewport(40, 30),
        'bottom-right',
        sizePx,
        8
      )
    ).toEqual([25, 15, 0]);
  });
});
