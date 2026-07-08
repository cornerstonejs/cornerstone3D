// Covers packages/tools/src/store/ pure-logic modules that run on every
// mouse move to find candidate tools/handles for hit-testing:
//   - filterToolsWithAnnotationsForElement.ts
//   - filterMoveableAnnotationTools.ts
//   - filterToolsWithMoveableHandles.ts
//   - cancelActiveManipulations.ts
//   - addTool.ts / state.ts registry logic
//
// None of these modules touch rendering/WebGL: they operate on plain tool
// instances and annotation POJOs, so we mock the stateManagement annotation
// module and the ToolGroupManager rather than pulling in real ones.

jest.mock('@cornerstonejs/core', () => ({
  utilities: {
    deepClone: (value) => JSON.parse(JSON.stringify(value)),
  },
  getEnabledElement: jest.fn(),
}));

jest.mock('../src/stateManagement/annotation/annotationState', () => ({
  getAnnotations: jest.fn(),
}));

jest.mock('../src/store/ToolGroupManager', () => ({
  getToolGroupForViewport: jest.fn(),
}));

import { getEnabledElement } from '@cornerstonejs/core';
import { getAnnotations } from '../src/stateManagement/annotation/annotationState';
import { getToolGroupForViewport } from '../src/store/ToolGroupManager';

import filterToolsWithAnnotationsForElement from '../src/store/filterToolsWithAnnotationsForElement';
import filterMoveableAnnotationTools from '../src/store/filterMoveableAnnotationTools';
import filterToolsWithMoveableHandles from '../src/store/filterToolsWithMoveableHandles';
import cancelActiveManipulations from '../src/store/cancelActiveManipulations';
import {
  addTool,
  hasTool,
  hasToolByName,
  removeTool,
} from '../src/store/addTool';
import { state, resetCornerstoneToolsState } from '../src/store/state';
import { ToolModes } from '../src/enums';

function createFakeAnnotation({
  isLocked = false,
  isVisible = true,
  uid = 'annotation-1',
} = {}) {
  return {
    annotationUID: uid,
    isLocked,
    isVisible,
    metadata: {},
    data: {},
  };
}

function createFakeTool(toolName, overrides = {}) {
  class FakeTool {
    static toolName = toolName;
  }
  return Object.assign(new FakeTool(), overrides);
}

describe('store/filterToolsWithAnnotationsForElement', () => {
  const element = document.createElement('div');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('excludes tools with no annotations for the element', () => {
    const tool = createFakeTool('ToolA');
    getAnnotations.mockReturnValue([]);

    const result = filterToolsWithAnnotationsForElement(element, [tool]);

    expect(result).toEqual([]);
  });

  it('excludes tools whose annotations lookup returns undefined', () => {
    const tool = createFakeTool('ToolA');
    getAnnotations.mockReturnValue(undefined);

    const result = filterToolsWithAnnotationsForElement(element, [tool]);

    expect(result).toEqual([]);
  });

  it('returns {tool, annotations} pairs for tools that have annotations', () => {
    const toolA = createFakeTool('ToolA');
    const toolB = createFakeTool('ToolB');
    const annotationsA = [createFakeAnnotation({ uid: 'a1' })];
    const annotationsB = [createFakeAnnotation({ uid: 'b1' })];

    getAnnotations.mockImplementation((toolName) =>
      toolName === 'ToolA' ? annotationsA : annotationsB
    );

    const result = filterToolsWithAnnotationsForElement(element, [
      toolA,
      toolB,
    ]);

    expect(result).toEqual([
      { tool: toolA, annotations: annotationsA },
      { tool: toolB, annotations: annotationsB },
    ]);
    // Called with (toolName, element) per tool.
    expect(getAnnotations).toHaveBeenCalledWith('ToolA', element);
    expect(getAnnotations).toHaveBeenCalledWith('ToolB', element);
  });

  it('skips undefined entries in the tools array without throwing', () => {
    const toolA = createFakeTool('ToolA');
    const annotationsA = [createFakeAnnotation()];
    getAnnotations.mockReturnValue(annotationsA);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = filterToolsWithAnnotationsForElement(element, [
      undefined,
      toolA,
    ]);

    expect(result).toEqual([{ tool: toolA, annotations: annotationsA }]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('applies filterInteractableAnnotationsForElement when a tool defines it', () => {
    const filtered = [createFakeAnnotation({ uid: 'kept' })];
    const filterInteractableAnnotationsForElement = jest.fn(() => filtered);
    const tool = createFakeTool('ToolA', {
      filterInteractableAnnotationsForElement,
    });
    const rawAnnotations = [
      createFakeAnnotation({ uid: 'kept' }),
      createFakeAnnotation({ uid: 'dropped' }),
    ];
    getAnnotations.mockReturnValue(rawAnnotations);

    const result = filterToolsWithAnnotationsForElement(element, [tool]);

    expect(filterInteractableAnnotationsForElement).toHaveBeenCalledWith(
      element,
      rawAnnotations
    );
    expect(result).toEqual([{ tool, annotations: filtered }]);
  });

  it('excludes a tool if its custom filter empties out the annotations', () => {
    const tool = createFakeTool('ToolA', {
      filterInteractableAnnotationsForElement: jest.fn(() => []),
    });
    getAnnotations.mockReturnValue([createFakeAnnotation()]);

    const result = filterToolsWithAnnotationsForElement(element, [tool]);

    expect(result).toEqual([]);
  });
});

describe('store/filterMoveableAnnotationTools', () => {
  const element = document.createElement('div');
  const canvasCoords = [10, 10];

  it('keeps a tool whose isPointNearTool returns true', () => {
    const annotation = createFakeAnnotation();
    const isPointNearTool = jest.fn(() => true);
    const tool = createFakeTool('ToolA', { isPointNearTool });

    const result = filterMoveableAnnotationTools(
      element,
      [{ tool, annotations: [annotation] }],
      canvasCoords
    );

    expect(result).toEqual([{ tool, annotation }]);
    // proximity for mouse interaction is 6 (see source comment / constant)
    expect(isPointNearTool).toHaveBeenCalledWith(
      element,
      annotation,
      canvasCoords,
      6,
      'mouse'
    );
  });

  it('drops a tool whose isPointNearTool returns false', () => {
    const annotation = createFakeAnnotation();
    const tool = createFakeTool('ToolA', {
      isPointNearTool: jest.fn(() => false),
    });

    const result = filterMoveableAnnotationTools(
      element,
      [{ tool, annotations: [annotation] }],
      canvasCoords
    );

    expect(result).toEqual([]);
  });

  it('skips locked annotations without calling isPointNearTool', () => {
    const annotation = createFakeAnnotation({ isLocked: true });
    const isPointNearTool = jest.fn(() => true);
    const tool = createFakeTool('ToolA', { isPointNearTool });

    const result = filterMoveableAnnotationTools(
      element,
      [{ tool, annotations: [annotation] }],
      canvasCoords
    );

    expect(result).toEqual([]);
    expect(isPointNearTool).not.toHaveBeenCalled();
  });

  it('skips invisible annotations without calling isPointNearTool', () => {
    const annotation = createFakeAnnotation({ isVisible: false });
    const isPointNearTool = jest.fn(() => true);
    const tool = createFakeTool('ToolA', { isPointNearTool });

    const result = filterMoveableAnnotationTools(
      element,
      [{ tool, annotations: [annotation] }],
      canvasCoords
    );

    expect(result).toEqual([]);
    expect(isPointNearTool).not.toHaveBeenCalled();
  });

  it('uses the larger touch proximity (36) for touch interaction', () => {
    const annotation = createFakeAnnotation();
    const isPointNearTool = jest.fn(() => true);
    const tool = createFakeTool('ToolA', { isPointNearTool });

    filterMoveableAnnotationTools(
      element,
      [{ tool, annotations: [annotation] }],
      canvasCoords,
      'touch'
    );

    expect(isPointNearTool).toHaveBeenCalledWith(
      element,
      annotation,
      canvasCoords,
      36,
      'touch'
    );
  });

  it('stops at the first moveable annotation per tool (one result per tool)', () => {
    const annotation1 = createFakeAnnotation({ uid: 'a1' });
    const annotation2 = createFakeAnnotation({ uid: 'a2' });
    const isPointNearTool = jest.fn(() => true);
    const tool = createFakeTool('ToolA', { isPointNearTool });

    const result = filterMoveableAnnotationTools(
      element,
      [{ tool, annotations: [annotation1, annotation2] }],
      canvasCoords
    );

    expect(result).toEqual([{ tool, annotation: annotation1 }]);
    expect(isPointNearTool).toHaveBeenCalledTimes(1);
  });
});

describe('store/filterToolsWithMoveableHandles', () => {
  const element = document.createElement('div');
  const canvasCoords = [5, 5];

  it('keeps a tool and reports the handle + annotation when a handle is found', () => {
    const annotation = createFakeAnnotation();
    const handle = [1, 2, 3];
    const getHandleNearImagePoint = jest.fn(() => handle);
    const tool = createFakeTool('ToolA', { getHandleNearImagePoint });

    const result = filterToolsWithMoveableHandles(
      element,
      [{ tool, annotations: [annotation] }],
      canvasCoords
    );

    expect(result).toEqual([{ tool, annotation, handle }]);
    expect(getHandleNearImagePoint).toHaveBeenCalledWith(
      element,
      annotation,
      canvasCoords,
      6
    );
  });

  it('excludes a tool when no handle is found nearby', () => {
    const annotation = createFakeAnnotation();
    const tool = createFakeTool('ToolA', {
      getHandleNearImagePoint: jest.fn(() => undefined),
    });

    const result = filterToolsWithMoveableHandles(
      element,
      [{ tool, annotations: [annotation] }],
      canvasCoords
    );

    expect(result).toEqual([]);
  });

  it('skips locked or invisible annotations', () => {
    const lockedAnnotation = createFakeAnnotation({ isLocked: true });
    const hiddenAnnotation = createFakeAnnotation({ isVisible: false });
    const getHandleNearImagePoint = jest.fn(() => [0, 0, 0]);
    const tool = createFakeTool('ToolA', { getHandleNearImagePoint });

    const result = filterToolsWithMoveableHandles(
      element,
      [{ tool, annotations: [lockedAnnotation, hiddenAnnotation] }],
      canvasCoords
    );

    expect(result).toEqual([]);
    expect(getHandleNearImagePoint).not.toHaveBeenCalled();
  });

  it('uses touch proximity (36) for touch interaction', () => {
    const annotation = createFakeAnnotation();
    const getHandleNearImagePoint = jest.fn(() => [1, 1, 1]);
    const tool = createFakeTool('ToolA', { getHandleNearImagePoint });

    filterToolsWithMoveableHandles(
      element,
      [{ tool, annotations: [annotation] }],
      canvasCoords,
      'touch'
    );

    expect(getHandleNearImagePoint).toHaveBeenCalledWith(
      element,
      annotation,
      canvasCoords,
      36
    );
  });
});

describe('store/cancelActiveManipulations', () => {
  const element = document.createElement('div');

  beforeEach(() => {
    jest.clearAllMocks();
    getEnabledElement.mockReturnValue({
      renderingEngineId: 'engine1',
      viewportId: 'viewport1',
    });
  });

  it('returns undefined when there is no toolGroup for the element', () => {
    getToolGroupForViewport.mockReturnValue(undefined);

    const result = cancelActiveManipulations(element);

    expect(result).toBeUndefined();
  });

  it('calls cancel() on active/passive tools and returns the first annotationUID cancelled', () => {
    const cancelToolA = jest.fn(() => undefined);
    const cancelToolB = jest.fn(() => 'annotation-uid-b');
    const toolInstanceA = createFakeTool('ToolA', { cancel: cancelToolA });
    const toolInstanceB = createFakeTool('ToolB', { cancel: cancelToolB });

    getToolGroupForViewport.mockReturnValue({
      toolOptions: {
        ToolA: { mode: ToolModes.Active },
        ToolB: { mode: ToolModes.Passive },
      },
      getToolInstance: (toolName) =>
        toolName === 'ToolA' ? toolInstanceA : toolInstanceB,
    });

    // Both tools need annotations on the element to be considered by
    // filterToolsWithAnnotationsForElement.
    getAnnotations.mockReturnValue([createFakeAnnotation()]);

    const result = cancelActiveManipulations(element);

    expect(cancelToolA).toHaveBeenCalledWith(element);
    // ToolA's cancel() returned undefined (nothing being manipulated), so
    // iteration continues and ToolB's cancel() result is returned.
    expect(cancelToolB).toHaveBeenCalledWith(element);
    expect(result).toBe('annotation-uid-b');
  });

  it('short-circuits and does not call cancel() on subsequent tools once one succeeds', () => {
    const cancelToolA = jest.fn(() => 'annotation-uid-a');
    const cancelToolB = jest.fn(() => 'annotation-uid-b');
    const toolInstanceA = createFakeTool('ToolA', { cancel: cancelToolA });
    const toolInstanceB = createFakeTool('ToolB', { cancel: cancelToolB });

    getToolGroupForViewport.mockReturnValue({
      toolOptions: {
        ToolA: { mode: ToolModes.Active },
        ToolB: { mode: ToolModes.Active },
      },
      getToolInstance: (toolName) =>
        toolName === 'ToolA' ? toolInstanceA : toolInstanceB,
    });
    getAnnotations.mockReturnValue([createFakeAnnotation()]);

    const result = cancelActiveManipulations(element);

    expect(result).toBe('annotation-uid-a');
    expect(cancelToolB).not.toHaveBeenCalled();
  });

  it('excludes tools with disabled/enabled modes that are not active/passive', () => {
    const cancelDisabledTool = jest.fn(() => 'should-not-be-returned');
    const toolInstance = createFakeTool('ToolDisabled', {
      cancel: cancelDisabledTool,
    });

    getToolGroupForViewport.mockReturnValue({
      toolOptions: {
        ToolDisabled: { mode: ToolModes.Disabled },
      },
      getToolInstance: () => toolInstance,
    });
    getAnnotations.mockReturnValue([createFakeAnnotation()]);

    const result = cancelActiveManipulations(element);

    expect(result).toBeUndefined();
    expect(cancelDisabledTool).not.toHaveBeenCalled();
  });

  it('ignores toolOptions entries with no options (falsy)', () => {
    getToolGroupForViewport.mockReturnValue({
      toolOptions: {
        ToolWithoutOptions: undefined,
      },
      getToolInstance: jest.fn(),
    });

    const result = cancelActiveManipulations(element);

    expect(result).toBeUndefined();
  });
});

describe('store/addTool & state registry', () => {
  beforeEach(() => {
    resetCornerstoneToolsState();
  });

  it('registers a tool class under its static toolName', () => {
    class MyFakeTool {
      static toolName = 'MyFakeTool';
    }

    addTool(MyFakeTool);

    expect(state.tools['MyFakeTool']).toEqual({ toolClass: MyFakeTool });
    expect(hasTool(MyFakeTool)).toBe(true);
    expect(hasToolByName('MyFakeTool')).toBe(true);
  });

  it('throws when the tool class has no static toolName', () => {
    class NoNameTool {}

    expect(() => addTool(NoNameTool)).toThrow(
      /No Tool Found for the ToolClass/
    );
  });

  it('does not overwrite an already-registered tool on duplicate addTool calls', () => {
    class MyFakeTool {
      static toolName = 'MyFakeTool';
    }
    class MyFakeToolV2 {
      static toolName = 'MyFakeTool';
    }

    addTool(MyFakeTool);
    addTool(MyFakeToolV2);

    // First registration wins; addTool is a no-op if the name already exists.
    expect(state.tools['MyFakeTool'].toolClass).toBe(MyFakeTool);
  });

  it('hasTool/hasToolByName return false for tools that were never registered', () => {
    class NeverAdded {
      static toolName = 'NeverAdded';
    }

    expect(hasTool(NeverAdded)).toBe(false);
    expect(hasToolByName('NeverAdded')).toBe(false);
  });

  it('removeTool deletes a previously registered tool', () => {
    class MyFakeTool {
      static toolName = 'MyFakeTool';
    }

    addTool(MyFakeTool);
    expect(hasTool(MyFakeTool)).toBe(true);

    removeTool(MyFakeTool);

    expect(hasTool(MyFakeTool)).toBe(false);
    expect(state.tools['MyFakeTool']).toBeUndefined();
  });

  it('removeTool throws when the tool class has no static toolName', () => {
    class NoNameTool {}

    expect(() => removeTool(NoNameTool)).toThrow(/No tool found for/);
  });

  // SUSPECTED PRODUCT BUG (src/store/addTool.ts removeTool):
  // `if (!state.tools[toolName] !== undefined)` always evaluates to true
  // (a boolean is never === undefined), so the `else throw` branch documented
  // as "cannot be removed because it has not been added" is unreachable dead
  // code. Calling removeTool on a tool that was never registered silently
  // no-ops instead of throwing. This test documents the actual behavior.
  it('removeTool on a never-registered tool does not throw (dead-code else branch)', () => {
    class NeverAdded {
      static toolName = 'NeverAddedForRemoval';
    }

    expect(() => removeTool(NeverAdded)).not.toThrow();
  });
});
