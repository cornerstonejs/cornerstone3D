import type { Types } from '@cornerstonejs/core';
import LengthTool from './LengthTool';
import { drawLinkedTextBox } from '../../drawingSvg';

jest.mock('../../drawingSvg', () => ({
  ...jest.requireActual('../../drawingSvg'),
  drawLinkedTextBox: jest.fn(() => ({ x: 0, y: 0, width: 10, height: 10 })),
}));

function renderTextBox(textLines: string[]) {
  const tool = new LengthTool();
  const viewport = {
    element: document.createElement('div'),
    canvasToWorld: ([x, y]: Types.Point2) => [x, y, 0],
    worldToCanvas: ([x, y]: Types.Point3) => [x, y],
  };
  const annotation = {
    annotationUID: 'length-1',
    metadata: { toolName: LengthTool.toolName },
    data: {
      handles: {
        points: [
          [0, 0, 0],
          [10, 10, 0],
        ],
      },
    },
  };

  // renderLinkedTextBoxAnnotation is protected, call it like a tool does.
  return (
    tool as unknown as {
      renderLinkedTextBoxAnnotation: (options: unknown) => boolean;
    }
  ).renderLinkedTextBoxAnnotation({
    enabledElement: { viewport },
    svgDrawingHelper: {},
    annotation,
    styleSpecifier: {
      toolGroupId: 'toolGroup',
      toolName: LengthTool.toolName,
      viewportId: 'viewport',
      annotationUID: annotation.annotationUID,
    },
    textLines,
    canvasCoordinates: [
      [0, 0],
      [10, 10],
    ],
  });
}

describe('LengthTool linked text box', () => {
  beforeEach(() => {
    (drawLinkedTextBox as jest.Mock).mockClear();
  });

  it('draws the text box and its link line when there is text', () => {
    expect(renderTextBox(['10 mm'])).toBe(true);
    expect(drawLinkedTextBox).toHaveBeenCalledTimes(1);
  });

  it('draws no text box or link line when there are no text lines', () => {
    expect(renderTextBox([])).toBe(false);
    expect(drawLinkedTextBox).not.toHaveBeenCalled();
  });
});
