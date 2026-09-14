jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');

  return {
    ...actual,
    getEnabledElement: jest.fn(() => ({ viewport: { id: 'viewport' } })),
  };
});

jest.mock('../utils/shouldUseLazyLabelmapEditing', () => ({
  shouldUseLazyLabelmapEditing: jest.fn(() => true),
}));

jest.mock('../../../cursors/elementCursor', () => ({
  resetElementCursor: jest.fn(),
  hideElementCursor: jest.fn(),
}));

jest.mock('../../../utilities/triggerAnnotationRenderForViewportIds', () => ({
  __esModule: true,
  default: jest.fn(),
}));

import BrushTool from '../BrushTool';
import LabelmapBaseTool from '../LabelmapBaseTool';
import StrategyCallbacks from '../../../enums/StrategyCallbacks';

/**
 * `LabelmapBaseTool.previewData` is a single static object shared by every labelmap
 * tool instance, and that is deliberate: any tool can then reject the preview that
 * any other tool created, so a tool switch in the middle of a preview still works.
 *
 * The shared object only holds that promise while `preview` stays truthful. A
 * strategy returns its initialized data for every stroke, with a preview or without
 * one, so each paint path stores the result through `_setPreview`, which keeps the
 * result only when `modified` says a preview segment index went onto the labelmap.
 *
 * Both directions of the guard matter:
 *
 * - A `preview` set by a stroke that previewed nothing makes `rejectPreview` run a
 *   strategy for nothing, and the sphere variants throw out of it on a series that
 *   cannot form a volume.
 * - A `preview` cleared while preview voxels are still on the labelmap makes
 *   `rejectPreview` skip the roll back, and no Escape, no tool switch and no
 *   `clear()` can remove those voxels afterwards.
 */
type MockedTool = {
  doneEditMemo: jest.Mock;
  getOperationData: jest.Mock;
  applyActiveStrategyCallback: jest.Mock;
  _setPreview: (results: unknown) => void;
  rejectPreview: (element?: HTMLDivElement) => void;
};

const buildTool = <T>(ToolClass: new (...args: never[]) => T) => {
  const tool = Object.create(ToolClass.prototype) as T & MockedTool;

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

  it('rejects the preview that another tool created', () => {
    const tool = buildTool(ToolClass);

    // The shared preview is the point of the static: the tool that rejects does not
    // have to be the tool that painted, so a tool switch mid preview still works.
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

describe.each([
  ['BrushTool', BrushTool],
  ['LabelmapBaseTool', LabelmapBaseTool],
])('%s._setPreview', (_name, ToolClass) => {
  beforeEach(() => {
    LabelmapBaseTool.previewData.preview = null;
  });

  it('keeps a result that set a preview up', () => {
    const tool = buildTool(ToolClass);
    const results = { modified: true };

    tool._setPreview(results);

    expect(LabelmapBaseTool.previewData.preview).toBe(results);
  });

  it('drops a result from a stroke that previewed nothing', () => {
    const tool = buildTool(ToolClass);

    // `BrushStrategy.fill` returns its initialized data for every stroke. With
    // previews disabled the `preview` composition leaves `modified` false, and the
    // stroke painted the real segment index, so there is nothing to reject.
    tool._setPreview({ modified: false });

    expect(LabelmapBaseTool.previewData.preview).toBeNull();
  });

  it('clears a stale preview when a later stroke previews nothing', () => {
    const tool = buildTool(ToolClass);

    LabelmapBaseTool.previewData.preview = { modified: true };

    tool._setPreview({ modified: false });

    expect(LabelmapBaseTool.previewData.preview).toBeNull();
  });
});

describe('BrushTool lazy stroke', () => {
  const element = document.createElement('div');

  beforeEach(() => {
    LabelmapBaseTool.previewData.preview = null;
    LabelmapBaseTool.previewData.element = null;
    LabelmapBaseTool.previewData.isDrag = false;
  });

  /**
   * The lazy stroke paints the whole path in one call, in `_endCallback`. The drag
   * itself writes no voxels, so `_dragCallback` correctly leaves `preview` null.
   * `_endCallback` has to store the result of the paint, or the reject at the end of
   * the stroke finds no preview and leaves the stroke on the labelmap.
   */
  it('stores the preview it paints, so a later reject rolls the stroke back', () => {
    const tool = new BrushTool({
      configuration: { preview: { enabled: true } },
    }) as BrushTool & MockedTool;

    tool.getOperationData = jest.fn(() => ({ segmentationId: 'segmentation' }));
    tool.applyActiveStrategyCallback = jest.fn();
    tool.doneEditMemo = jest.fn();

    Object.assign(tool, {
      applyActiveStrategy: jest.fn(() => ({ modified: true })),
      _hoverData: { viewport: {}, viewportIdsToRender: ['viewport'] },
      _lazyEdit: { getStrokePointsWorld: () => [] },
      _deactivateDraw: jest.fn(),
      _scheduleLazyPreviewCleanup: jest.fn(),
      _isTouchInteraction: jest.fn(() => false),
    });

    // The drag set `isDrag`, and the lazy branch of `_dragCallback` left `preview`
    // null because nothing was painted yet.
    LabelmapBaseTool.previewData.element = element;
    LabelmapBaseTool.previewData.isDrag = true;
    LabelmapBaseTool.previewData.preview = null;

    (tool as unknown as { _endCallback: (evt: unknown) => void })._endCallback({
      detail: {
        element,
        eventName: 'CORNERSTONE_TOOLS_MOUSE_UP',
        currentPoints: { canvas: [0, 0] },
      },
    });

    expect(LabelmapBaseTool.previewData.preview).toEqual({ modified: true });

    tool.rejectPreview(element);

    expect(rejectCallbackCalls(tool)).toHaveLength(1);
  });
});
