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
  utilities: {
    logger: {
      toolsLog: {
        getLogger: jest.fn(() => ({
          debug: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          setLevel: jest.fn(),
        })),
      },
    },
  },
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

  describe('frame scheduling', () => {
    let frames: FrameRequestCallback[];
    let rafSpy: jest.SpyInstance;
    let triggerRenderSpy: jest.SpyInstance;
    const runNextFrame = () => frames.shift()(0);

    beforeEach(() => {
      frames = [];
      rafSpy = jest
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((callback) => {
          frames.push(callback);
          return frames.length;
        });
      triggerRenderSpy = jest
        .spyOn(segmentationRenderingEngine, '_triggerRender')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      // The engine is a shared singleton: run the frames that a test left
      // scheduled, so that the next test starts with no frame scheduled.
      while (frames.length) {
        runNextFrame();
      }
      rafSpy.mockRestore();
      triggerRenderSpy.mockRestore();
    });

    it('renders each viewport once for many requests before a frame', () => {
      for (let index = 0; index < 1000; index++) {
        segmentationRenderingEngine.renderSegmentationsForViewport(
          index % 2 ? 'viewport-a' : 'viewport-b'
        );
      }

      expect(frames).toHaveLength(1);
      runNextFrame();

      expect(triggerRenderSpy.mock.calls).toEqual([
        ['viewport-b'],
        ['viewport-a'],
      ]);
      expect(frames).toHaveLength(0);
    });

    it('renders the other viewports of a frame when one viewport throws', () => {
      triggerRenderSpy.mockImplementationOnce(() => {
        throw new Error('render failed');
      });

      segmentationRenderingEngine.renderSegmentationsForViewport('viewport-a');
      segmentationRenderingEngine.renderSegmentationsForViewport('viewport-b');
      runNextFrame();

      expect(triggerRenderSpy.mock.calls).toEqual([
        ['viewport-a'],
        ['viewport-b'],
      ]);
      expect(frames).toHaveLength(0);
    });

    it('renders a request made during a frame in the next frame', () => {
      triggerRenderSpy.mockImplementationOnce(() => {
        segmentationRenderingEngine.renderSegmentationsForViewport(
          'viewport-a'
        );
      });

      segmentationRenderingEngine.renderSegmentationsForViewport('viewport-a');
      runNextFrame();

      expect(triggerRenderSpy).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(1);

      runNextFrame();

      expect(triggerRenderSpy).toHaveBeenCalledTimes(2);
      expect(frames).toHaveLength(0);
    });
  });
});
