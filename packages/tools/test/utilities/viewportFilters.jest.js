jest.mock('@cornerstonejs/core', () => ({
  getEnabledElement: jest.fn(),
  utilities: {
    isGenericViewport: jest.fn(() => false),
    clonePoint3: (point) =>
      point ? [point[0], point[1], point[2]] : undefined,
    isEqual: (v1, v2, tolerance = 1e-5) => {
      if (!v1 || !v2 || v1.length !== v2.length) {
        return false;
      }
      for (let i = 0; i < v1.length; i++) {
        if (Math.abs(v1[i] - v2[i]) > tolerance) {
          return false;
        }
      }
      return true;
    },
  },
}));

jest.mock('../../src/store/ToolGroupManager', () => ({
  getToolGroupForViewport: jest.fn(),
}));

import { getEnabledElement } from '@cornerstonejs/core';
import { getToolGroupForViewport } from '../../src/store/ToolGroupManager';

import filterViewportsWithFrameOfReferenceUID from '../../src/utilities/viewportFilters/filterViewportsWithFrameOfReferenceUID';
import filterViewportsWithSameOrientation from '../../src/utilities/viewportFilters/filterViewportsWithSameOrientation';
import filterViewportsWithParallelNormals from '../../src/utilities/viewportFilters/filterViewportsWithParallelNormals';
import filterViewportsWithToolEnabled from '../../src/utilities/viewportFilters/filterViewportsWithToolEnabled';
import getViewportIdsWithToolToRender from '../../src/utilities/viewportFilters/getViewportIdsWithToolToRender';

function createViewport({
  id = 'vp',
  renderingEngineId = 're1',
  frameOfReferenceUID = 'FOR1',
  viewPlaneNormal = [0, 0, 1],
  viewUp = [0, 1, 0],
  focalPoint = [0, 0, 0],
} = {}) {
  return {
    id,
    renderingEngineId,
    getFrameOfReferenceUID: jest.fn(() => frameOfReferenceUID),
    getViewReference: jest.fn(() => ({
      cameraFocalPoint: focalPoint,
      viewPlaneNormal,
      viewUp,
    })),
  };
}

describe('filterViewportsWithFrameOfReferenceUID', () => {
  it('keeps only viewports with a matching FrameOfReferenceUID', () => {
    const match1 = createViewport({ id: 'a', frameOfReferenceUID: 'FOR1' });
    const match2 = createViewport({ id: 'b', frameOfReferenceUID: 'FOR1' });
    const other = createViewport({ id: 'c', frameOfReferenceUID: 'FOR2' });

    const result = filterViewportsWithFrameOfReferenceUID(
      [match1, other, match2],
      'FOR1'
    );

    expect(result).toEqual([match1, match2]);
  });

  it('returns an empty array when nothing matches', () => {
    const other = createViewport({ frameOfReferenceUID: 'FOR2' });
    expect(filterViewportsWithFrameOfReferenceUID([other], 'FOR1')).toEqual([]);
  });

  it('returns an empty array for an empty input list', () => {
    expect(filterViewportsWithFrameOfReferenceUID([], 'FOR1')).toEqual([]);
  });
});

describe('filterViewportsWithParallelNormals', () => {
  it('keeps viewports with the same normal', () => {
    const ref = createViewport({ viewPlaneNormal: [0, 0, 1] });
    const same = createViewport({ id: 'same', viewPlaneNormal: [0, 0, 1] });

    expect(filterViewportsWithParallelNormals([same], ref)).toEqual([same]);
  });

  it('keeps viewports with an antiparallel (opposite-sign) normal', () => {
    const ref = createViewport({ viewPlaneNormal: [0, 0, 1] });
    const opposite = createViewport({ id: 'opp', viewPlaneNormal: [0, 0, -1] });

    expect(filterViewportsWithParallelNormals([opposite], ref)).toEqual([
      opposite,
    ]);
  });

  it('excludes perpendicular normals', () => {
    const ref = createViewport({ viewPlaneNormal: [0, 0, 1] });
    const perp = createViewport({ id: 'perp', viewPlaneNormal: [1, 0, 0] });

    expect(filterViewportsWithParallelNormals([perp], ref)).toEqual([]);
  });

  it('keeps normals within the default tolerance and excludes normals beyond it', () => {
    const ref = createViewport({ viewPlaneNormal: [0, 0, 1] });

    // ~2 degree tilt: dot ~ 0.9994, which is above the default EPS of 0.999
    const closeAngle = (2 * Math.PI) / 180;
    const close = createViewport({
      id: 'close',
      viewPlaneNormal: [0, Math.sin(closeAngle), Math.cos(closeAngle)],
    });

    // ~5 degree tilt: dot ~ 0.9962, which is below the default EPS of 0.999
    const farAngle = (5 * Math.PI) / 180;
    const far = createViewport({
      id: 'far',
      viewPlaneNormal: [0, Math.sin(farAngle), Math.cos(farAngle)],
    });

    expect(filterViewportsWithParallelNormals([close], ref)).toEqual([close]);
    expect(filterViewportsWithParallelNormals([far], ref)).toEqual([]);
  });

  it('returns an empty array when the reference viewport has no normal', () => {
    const ref = { getViewReference: jest.fn(() => ({})) };
    const other = createViewport();

    expect(filterViewportsWithParallelNormals([other], ref)).toEqual([]);
  });

  it('excludes candidate viewports that have no normal', () => {
    const ref = createViewport({ viewPlaneNormal: [0, 0, 1] });
    const noNormal = { getViewReference: jest.fn(() => ({})) };

    expect(filterViewportsWithParallelNormals([noNormal], ref)).toEqual([]);
  });
});

describe('filterViewportsWithSameOrientation', () => {
  it('keeps viewports with a matching normal and viewUp', () => {
    const ref = createViewport({
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
    });
    const same = createViewport({
      id: 'same',
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
    });

    expect(filterViewportsWithSameOrientation([same], ref)).toEqual([same]);
  });

  it('excludes an antiparallel normal even though it is "parallel"', () => {
    const ref = createViewport({
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
    });
    const opposite = createViewport({
      id: 'opp',
      viewPlaneNormal: [0, 0, -1],
      viewUp: [0, 1, 0],
    });

    expect(filterViewportsWithSameOrientation([opposite], ref)).toEqual([]);
  });

  it('excludes perpendicular normals', () => {
    const ref = createViewport({
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
    });
    const perp = createViewport({
      id: 'perp',
      viewPlaneNormal: [1, 0, 0],
      viewUp: [0, 1, 0],
    });

    expect(filterViewportsWithSameOrientation([perp], ref)).toEqual([]);
  });

  it('keeps normals within the isEqual epsilon tolerance', () => {
    const ref = createViewport({
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
    });
    const tiny = createViewport({
      id: 'tiny',
      viewPlaneNormal: [0, 0, 1 + 1e-7],
      viewUp: [0, 1, 0],
    });

    expect(filterViewportsWithSameOrientation([tiny], ref)).toEqual([tiny]);
  });

  it('excludes normals beyond the isEqual epsilon tolerance', () => {
    const ref = createViewport({
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
    });
    const off = createViewport({
      id: 'off',
      viewPlaneNormal: [0, 0.01, 0.99995],
      viewUp: [0, 1, 0],
    });

    expect(filterViewportsWithSameOrientation([off], ref)).toEqual([]);
  });

  it('excludes a matching normal with a different viewUp', () => {
    const ref = createViewport({
      viewPlaneNormal: [0, 0, 1],
      viewUp: [0, 1, 0],
    });
    const differentUp = createViewport({
      id: 'diff-up',
      viewPlaneNormal: [0, 0, 1],
      viewUp: [1, 0, 0],
    });

    expect(filterViewportsWithSameOrientation([differentUp], ref)).toEqual([]);
  });

  it('returns an empty array when the reference has no orientation', () => {
    const ref = { getViewReference: jest.fn(() => ({})) };

    expect(filterViewportsWithSameOrientation([createViewport()], ref)).toEqual(
      []
    );
  });
});

describe('filterViewportsWithToolEnabled', () => {
  beforeEach(() => {
    getToolGroupForViewport.mockReset();
  });

  it('keeps viewports whose tool group has the tool Active, Passive, or Enabled', () => {
    const active = createViewport({ id: 'active' });
    const passive = createViewport({ id: 'passive' });
    const enabled = createViewport({ id: 'enabled' });
    const disabled = createViewport({ id: 'disabled' });
    const noGroup = createViewport({ id: 'no-group' });
    const noTool = createViewport({ id: 'no-tool' });

    getToolGroupForViewport.mockImplementation((viewportId) => {
      switch (viewportId) {
        case 'active':
          return { toolOptions: { MyTool: { mode: 'Active' } } };
        case 'passive':
          return { toolOptions: { MyTool: { mode: 'Passive' } } };
        case 'enabled':
          return { toolOptions: { MyTool: { mode: 'Enabled' } } };
        case 'disabled':
          return { toolOptions: { MyTool: { mode: 'Disabled' } } };
        case 'no-tool':
          return { toolOptions: {} };
        default:
          return undefined;
      }
    });

    const result = filterViewportsWithToolEnabled(
      [active, passive, enabled, disabled, noGroup, noTool],
      'MyTool'
    );

    expect(result).toEqual([active, passive, enabled]);
    expect(getToolGroupForViewport).toHaveBeenCalledWith('active', 're1');
  });

  it('returns an empty array when no viewport has a tool group', () => {
    getToolGroupForViewport.mockReturnValue(undefined);
    const vp = createViewport();

    expect(filterViewportsWithToolEnabled([vp], 'MyTool')).toEqual([]);
  });
});

describe('getViewportIdsWithToolToRender', () => {
  beforeEach(() => {
    getToolGroupForViewport.mockReset();
    getEnabledElement.mockReset();
  });

  it('composes the frame-of-reference, tool-enabled, and parallel-normal filters', () => {
    const current = createViewport({
      id: 'current',
      frameOfReferenceUID: 'FOR1',
      viewPlaneNormal: [0, 0, 1],
    });
    const parallelWithTool = createViewport({
      id: 'parallel-tool',
      frameOfReferenceUID: 'FOR1',
      viewPlaneNormal: [0, 0, 1],
    });
    const perpendicularWithTool = createViewport({
      id: 'perp-tool',
      frameOfReferenceUID: 'FOR1',
      viewPlaneNormal: [1, 0, 0],
    });
    const parallelWithoutTool = createViewport({
      id: 'parallel-no-tool',
      frameOfReferenceUID: 'FOR1',
      viewPlaneNormal: [0, 0, 1],
    });
    const otherFrame = createViewport({
      id: 'other-frame',
      frameOfReferenceUID: 'FOR2',
      viewPlaneNormal: [0, 0, 1],
    });

    const allViewports = [
      current,
      parallelWithTool,
      perpendicularWithTool,
      parallelWithoutTool,
      otherFrame,
    ];

    const renderingEngine = {
      getViewports: jest.fn(() => allViewports),
      getViewport: jest.fn((id) => allViewports.find((vp) => vp.id === id)),
    };

    getEnabledElement.mockReturnValue({
      renderingEngine,
      FrameOfReferenceUID: 'FOR1',
      viewportId: 'current',
    });

    getToolGroupForViewport.mockImplementation((viewportId) => {
      const withTool = ['current', 'parallel-tool', 'perp-tool'];
      return withTool.includes(viewportId)
        ? { toolOptions: { MyTool: { mode: 'Active' } } }
        : undefined;
    });

    const element = document.createElement('div');
    const result = getViewportIdsWithToolToRender(element, 'MyTool');

    expect(result).toEqual(['current', 'parallel-tool']);
  });

  it('skips the parallel-normal filter when requireParallelNormals is false', () => {
    const current = createViewport({
      id: 'current',
      frameOfReferenceUID: 'FOR1',
      viewPlaneNormal: [0, 0, 1],
    });
    const perpendicularWithTool = createViewport({
      id: 'perp-tool',
      frameOfReferenceUID: 'FOR1',
      viewPlaneNormal: [1, 0, 0],
    });
    const allViewports = [current, perpendicularWithTool];

    const renderingEngine = {
      getViewports: jest.fn(() => allViewports),
      getViewport: jest.fn((id) => allViewports.find((vp) => vp.id === id)),
    };

    getEnabledElement.mockReturnValue({
      renderingEngine,
      FrameOfReferenceUID: 'FOR1',
      viewportId: 'current',
    });

    getToolGroupForViewport.mockReturnValue({
      toolOptions: { MyTool: { mode: 'Active' } },
    });

    const element = document.createElement('div');
    const result = getViewportIdsWithToolToRender(element, 'MyTool', false);

    expect(result).toEqual(['current', 'perp-tool']);
  });

  it('excludes viewports outside the frame of reference even with the tool enabled', () => {
    const current = createViewport({
      id: 'current',
      frameOfReferenceUID: 'FOR1',
      viewPlaneNormal: [0, 0, 1],
    });
    const otherFrame = createViewport({
      id: 'other-frame',
      frameOfReferenceUID: 'FOR2',
      viewPlaneNormal: [0, 0, 1],
    });
    const allViewports = [current, otherFrame];

    const renderingEngine = {
      getViewports: jest.fn(() => allViewports),
      getViewport: jest.fn((id) => allViewports.find((vp) => vp.id === id)),
    };

    getEnabledElement.mockReturnValue({
      renderingEngine,
      FrameOfReferenceUID: 'FOR1',
      viewportId: 'current',
    });

    getToolGroupForViewport.mockReturnValue({
      toolOptions: { MyTool: { mode: 'Active' } },
    });

    const element = document.createElement('div');
    const result = getViewportIdsWithToolToRender(element, 'MyTool');

    expect(result).toEqual(['current']);
  });
});
