jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');

  return {
    ...actual,
    getEnabledElement: jest.fn(() => ({ viewport: {} })),
  };
});

import BrushTool from '../BrushTool';
import LabelmapBaseTool from '../LabelmapBaseTool';
import StrategyCallbacks from '../../../enums/StrategyCallbacks';

/**
 * `LabelmapBaseTool.previewData` is a single static object shared by every labelmap
 * tool instance, so painting with one tool leaves `element` set for all of them. The
 * tools have to tell "some tool has drawn" apart from "this tool has a preview to
 * reject": rejecting a preview that does not exist runs a strategy for nothing, and
 * the sphere variants throw out of it on a series that cannot form a volume.
 */
const buildTool = <T>(ToolClass: new (...args: never[]) => T) => {
  const tool = Object.create(ToolClass.prototype) as T & {
    doneEditMemo: jest.Mock;
    getOperationData: jest.Mock;
    applyActiveStrategyCallback: jest.Mock;
  };

  tool.doneEditMemo = jest.fn();
  tool.getOperationData = jest.fn(() => ({ segmentationId: 'segmentation' }));
  tool.applyActiveStrategyCallback = jest.fn();

  return tool;
};

const rejectCallbackCalls = (tool: {
  applyActiveStrategyCallback: jest.Mock;
}) =>
  tool.applyActiveStrategyCallback.mock.calls.filter(
    ([, , callback]) => callback === StrategyCallbacks.RejectPreview
  );

describe.each([
  ['BrushTool', BrushTool],
  ['LabelmapBaseTool', LabelmapBaseTool],
])('%s.rejectPreview', (_name, ToolClass) => {
  const element = document.createElement('div');

  beforeEach(() => {
    LabelmapBaseTool.previewData.preview = null;
    LabelmapBaseTool.previewData.element = null;
    LabelmapBaseTool.previewData.isDrag = false;
  });

  it('leaves the strategy alone when another tool set the shared element', () => {
    const tool = buildTool(ToolClass);

    // What painting with the circular brush leaves behind: an element, no preview.
    LabelmapBaseTool.previewData.element = element;

    tool.rejectPreview();

    expect(rejectCallbackCalls(tool)).toHaveLength(0);
    // The edit memo still has to be closed, preview or not.
    expect(tool.doneEditMemo).toHaveBeenCalled();
  });

  it('rejects a preview this tool does have', () => {
    const tool = buildTool(ToolClass);

    LabelmapBaseTool.previewData.element = element;
    LabelmapBaseTool.previewData.preview = { modified: true };

    tool.rejectPreview();

    expect(rejectCallbackCalls(tool)).toHaveLength(1);
    expect(LabelmapBaseTool.previewData.preview).toBeNull();
  });

  it('does nothing at all when no tool has drawn', () => {
    const tool = buildTool(ToolClass);

    tool.rejectPreview();

    expect(tool.doneEditMemo).not.toHaveBeenCalled();
    expect(tool.applyActiveStrategyCallback).not.toHaveBeenCalled();
  });
});
