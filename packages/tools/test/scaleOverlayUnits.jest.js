import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { drawLine, drawTextBox } from '../src/drawingSvg';
import { getAnnotations } from '../src/stateManagement/annotation/annotationState';
import ScaleOverlayTool from '../src/tools/ScaleOverlayTool';

jest.mock('../src/drawingSvg', () => ({
  drawLine: jest.fn(),
  drawTextBox: jest.fn(),
}));

jest.mock('../src/stateManagement/annotation/annotationState', () => ({
  addAnnotation: jest.fn(),
  getAnnotations: jest.fn(),
}));

/**
 * Renders the scale over a 600 x 600 view whose world units map one to one
 * to canvas pixels, and returns the label and the length of the scale line
 * in canvas pixels.
 */
function renderScale(imageData) {
  const tool = new ScaleOverlayTool();
  const viewport = {
    id: 'viewport',
    element: document.createElement('div'),
    canvas: { width: 600, height: 600 },
    worldToCanvas: ([x, y]) => [x, y],
    ...(imageData && { getImageData: () => imageData }),
  };
  getAnnotations.mockReturnValue([
    {
      annotationUID: 'scale',
      data: {
        viewportId: 'viewport',
        handles: {
          points: [
            [0, 0, 0],
            [600, 0, 0],
            [0, 600, 0],
            [600, 600, 0],
          ],
        },
      },
    },
  ]);
  tool.editData = { viewport };

  tool.renderAnnotation({ viewport }, {});

  const [, , , start, end] = drawLine.mock.calls[0];
  const [, , , lines] = drawTextBox.mock.calls[0];
  return { lines, length: Math.hypot(end[0] - start[0], end[1] - start[1]) };
}

describe('ScaleOverlayTool units', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 1,
    });
  });

  it('labels and sizes the scale in mm on an image with pixel spacing', () => {
    const { lines, length } = renderScale({
      hasPixelSpacing: true,
      spacing: [1, 1, 1],
    });

    // 600 mm across: 250 mm is the size between 20% and 60% of the width
    expect(lines).toEqual(['25 cm']);
    expect(length).toBeCloseTo(250);
  });

  it('labels the scale in pixels on an image without pixel spacing', () => {
    // An ultrasound frame without pixel spacing: world units are pixels
    const { lines, length } = renderScale({
      hasPixelSpacing: false,
      spacing: [1, 1, 1],
    });

    expect(lines).toEqual(['250 px']);
    expect(length).toBeCloseTo(250);
  });

  it('applies a user calibration to the length the scale covers', () => {
    // A user calibration of 2: 2 world units measure 1 mm, so the view is
    // 300 mm across, and 100 mm covers 200 world units
    const { lines, length } = renderScale({
      hasPixelSpacing: true,
      spacing: [1, 1, 1],
      calibration: { type: 'User', scale: 2 },
    });

    expect(lines).toEqual(['10 cm']);
    expect(length).toBeCloseTo(200);
  });

  it('keeps mm on a viewport without image data', () => {
    const { lines, length } = renderScale(undefined);

    expect(lines).toEqual(['25 cm']);
    expect(length).toBeCloseTo(250);
  });
});
