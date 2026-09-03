jest.mock('@cornerstonejs/core', () => ({
  Enums: {
    Events: {
      IMAGE_RENDERED: 'IMAGE_RENDERED',
    },
  },
  eventTarget: {},
  getEnabledElementByViewportId: jest.fn(),
  getRenderingEngines: jest.fn(() => []),
  triggerEvent: jest.fn(),
}));

jest.mock('./getSegmentation', () => ({
  getSegmentation: jest.fn(),
}));

jest.mock('./getSegmentationRepresentation', () => ({
  getSegmentationRepresentations: jest.fn(),
}));

jest.mock('./SegmentationRepresentationDisplayRegistry', () => ({
  getSegmentationRepresentationDisplay: jest.fn(),
}));

jest.mock('../../store/addTool', () => ({
  addTool: jest.fn(),
}));

jest.mock('../../store/state', () => ({
  state: {
    tools: {},
  },
}));

jest.mock('../../store/ToolGroupManager', () => ({
  getToolGroupForViewport: jest.fn(() => ({
    addTool: jest.fn(),
    hasTool: jest.fn(() => true),
    setToolPassive: jest.fn(),
  })),
}));

jest.mock('./segmentationEventManager', () => ({
  addDefaultSegmentationListener: jest.fn(),
}));

jest.mock(
  '../../tools/annotation/PlanarFreehandContourSegmentationTool',
  () => ({
    __esModule: true,
    default: {
      toolName: 'PlanarFreehandContourSegmentationTool',
    },
  })
);

import { getEnabledElementByViewportId } from '@cornerstonejs/core';
import { getSegmentation } from './getSegmentation';
import { getSegmentationRepresentations } from './getSegmentationRepresentation';
import { getSegmentationRepresentationDisplay } from './SegmentationRepresentationDisplayRegistry';
import { segmentationRenderingEngine } from './SegmentationRenderingEngine';

const getEnabledElementByViewportIdMock =
  getEnabledElementByViewportId as jest.Mock;
const getSegmentationMock = getSegmentation as jest.Mock;
const getSegmentationRepresentationsMock =
  getSegmentationRepresentations as jest.Mock;
const getSegmentationRepresentationDisplayMock =
  getSegmentationRepresentationDisplay as jest.Mock;

async function flushPromises(times = 2): Promise<void> {
  for (let index = 0; index < times; index++) {
    await Promise.resolve();
  }
}

function flushMacrotask(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

describe('SegmentationRenderingEngine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('waits for async display reconciliation before rendering the viewport', async () => {
    let resolveDisplayRender: () => void;
    const displayRenderPromise = new Promise<void>((resolve) => {
      resolveDisplayRender = resolve;
    });
    const viewport = {
      id: 'viewport-id',
      element: document.createElement('div'),
      render: jest.fn(),
    };

    getEnabledElementByViewportIdMock.mockReturnValue({
      viewport,
    });
    getSegmentationRepresentationsMock.mockReturnValue([
      {
        segmentationId: 'segmentation-id',
        type: 'Labelmap',
      },
    ]);
    getSegmentationMock.mockReturnValue({
      representationData: {
        Labelmap: {},
      },
    });
    getSegmentationRepresentationDisplayMock.mockReturnValue({
      render: jest.fn(() => displayRenderPromise),
    });

    segmentationRenderingEngine._triggerRender('viewport-id');

    await flushPromises();

    expect(viewport.render).not.toHaveBeenCalled();

    resolveDisplayRender();
    await flushPromises();
    await flushMacrotask();

    expect(viewport.render).toHaveBeenCalledTimes(1);
  });
});
