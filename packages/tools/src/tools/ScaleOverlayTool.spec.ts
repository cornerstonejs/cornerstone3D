import type { Types } from '@cornerstonejs/core';
import {
  getEnabledElementByIds,
  getRenderingEngines,
} from '@cornerstonejs/core';
import ScaleOverlayTool from './ScaleOverlayTool';
import { getAnnotations } from '../stateManagement/annotation/annotationState';
import { drawLine, drawTextBox } from '../drawingSvg';
import { getToolGroup } from '../store/ToolGroupManager';

jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getEnabledElementByIds: jest.fn(),
  getRenderingEngines: jest.fn(),
}));
jest.mock('../stateManagement/annotation/annotationState', () => ({
  ...jest.requireActual('../stateManagement/annotation/annotationState'),
  getAnnotations: jest.fn(),
}));
jest.mock('../drawingSvg', () => ({
  ...jest.requireActual('../drawingSvg'),
  drawLine: jest.fn(),
  drawTextBox: jest.fn(),
}));
jest.mock('../store/ToolGroupManager', () => ({
  ...jest.requireActual('../store/ToolGroupManager'),
  getToolGroup: jest.fn(),
}));

/** Renders the scale on a viewport that shows `size` mm of the image. */
function renderScale(size: number) {
  const tool = new ScaleOverlayTool();
  const viewport = {
    id: 'viewport',
    element: document.createElement('div'),
    canvas: { width: 500, height: 500 },
    worldToCanvas: ([x, y]: Types.Point3) => [
      (x / size) * 500,
      (y / size) * 500,
    ],
  };
  (getAnnotations as jest.Mock).mockReturnValue([
    {
      annotationUID: 'scale-1',
      metadata: { toolName: ScaleOverlayTool.toolName },
      data: {
        viewportId: viewport.id,
        handles: {
          points: [
            [0, 0, 0],
            [size, 0, 0],
            [0, size, 0],
            [size, size, 0],
          ],
        },
      },
    },
  ]);
  tool.editData = { viewport } as unknown as ScaleOverlayTool['editData'];

  return tool.renderAnnotation(
    { viewport } as unknown as Types.IEnabledElement,
    {} as never
  );
}

describe('ScaleOverlayTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('draws the scale and its label', () => {
    renderScale(100);

    expect(drawLine).toHaveBeenCalled();
    expect((drawTextBox as jest.Mock).mock.calls[0][3]).toEqual(['5 cm']);
  });

  it('draws nothing when no scale size fits the viewport', () => {
    expect(() => renderScale(2)).not.toThrow();
    expect(drawLine).not.toHaveBeenCalled();
    expect(drawTextBox).not.toHaveBeenCalled();
  });

  it('does not throw when no viewport of the tool group is enabled', () => {
    (getRenderingEngines as jest.Mock).mockReturnValue([{}]);
    (getToolGroup as jest.Mock).mockReturnValue({
      viewportsInfo: [{ viewportId: 'viewport', renderingEngineId: 'engine' }],
    });
    (getEnabledElementByIds as jest.Mock).mockReturnValue(undefined);

    expect(() => new ScaleOverlayTool()._init()).not.toThrow();
  });
});
