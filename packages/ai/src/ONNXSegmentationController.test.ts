import ONNXSegmentationController from './ONNXSegmentationController';
import { eventTarget, triggerEvent } from '@cornerstonejs/core';
import { Enums as toolsEnums } from '@cornerstonejs/tools';
import type { Types } from '@cornerstonejs/tools';

jest.mock('onnxruntime-web/webgpu', () => ({
  __esModule: true,
  default: { env: { wasm: {} } },
}));

/**
 * With auto segment mode on, every render of the controller's viewport runs
 * the propagation step. `LabelmapSlicePropagationTool` re-points the controller
 * at whichever viewport becomes active, so that render can come from a viewport
 * that has no segmentation of its own.
 */
describe('ONNXSegmentationController auto segment mode', () => {
  const viewportWithoutSegmentation = {
    id: 'viewport-without-segmentation',
    element: document.createElement('div'),
    getCurrentImageId: () => 'imageId:2',
    getViewReferenceId: () => undefined,
    getCurrentImageIdIndex: () => 1,
    getImageIds: () => ['imageId:1', 'imageId:2', 'imageId:3'],
  };

  let controller: ONNXSegmentationController;
  let internals: {
    viewport: typeof viewportWithoutSegmentation;
    randomPoints: unknown[];
    viewportRenderedListener: (event?: unknown) => void;
    currentImage: unknown;
    decode: (...args: unknown[]) => Promise<void>;
    runDecode: () => Promise<void>;
  };

  beforeEach(() => {
    controller = new ONNXSegmentationController({ autoSegmentMode: true });
    controller.enabled = true;
    internals = controller as unknown as typeof internals;
    // No model is loaded here, so there is nothing for it to encode.
    jest.spyOn(controller, 'tryLoad').mockImplementation(() => undefined);
    // jsdom has no 2d canvas context.
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ clearRect: jest.fn() } as never);
  });

  afterEach(() => {
    if (internals.viewport) {
      controller.disconnectViewport(internals.viewport);
    }
    jest.restoreAllMocks();
  });

  it('still encodes on a viewport with no active segmentation, without propagation points', () => {
    internals.viewport = viewportWithoutSegmentation;
    internals.randomPoints = [[10, 20, 30]];

    expect(() => internals.viewportRenderedListener()).not.toThrow();
    expect(controller.tryLoad).toHaveBeenCalled();
    expect(internals.randomPoints).toEqual([]);
  });

  it('clears the propagation points for an unchanged image when the segmentation is gone', () => {
    internals.viewport = viewportWithoutSegmentation;
    internals.currentImage = { imageId: 'imageId:2' };
    internals.randomPoints = [[10, 20, 30]];

    internals.viewportRenderedListener();

    expect(controller.tryLoad).not.toHaveBeenCalled();
    expect(internals.randomPoints).toEqual([]);
  });

  it('does not decode on a viewport with no active segmentation', async () => {
    internals.viewport = viewportWithoutSegmentation;
    internals.currentImage = { imageId: 'imageId:2', imageEmbeddings: {} };
    const decode = jest.spyOn(internals, 'decode').mockResolvedValue(undefined);

    await internals.runDecode();

    expect(decode).not.toHaveBeenCalled();
  });

  it('does not carry propagation points over to the next viewport', () => {
    // Left over from painting on the previous viewport; decoding them against
    // the next one previews into a segmentation that viewport may not have.
    internals.randomPoints = [[10, 20, 30]];

    controller.initViewport(viewportWithoutSegmentation);

    expect(internals.randomPoints).toEqual([]);
  });
});

describe('ONNXSegmentationController marker mode', () => {
  const imageId = 'imageId:1';
  const marker: Types.Annotation = {
    metadata: { toolName: ONNXSegmentationController.MarkerInclude },
    data: { handles: { points: [[10, 20, 0]] } },
  };
  let viewport;
  let prompts: Types.Annotation[];
  let controller: ONNXSegmentationController;
  let decode: jest.SpyInstance;
  let internals: {
    viewport: typeof viewport;
    sessions: unknown[];
    isGpuInUse: boolean;
    getActiveSegmentation: () => unknown;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    viewport = {
      id: 'marker-viewport',
      element: document.createElement('div'),
      getCurrentImageId: () => imageId,
    };
    prompts = [];
    controller = new ONNXSegmentationController({
      getPromptAnnotations: () => prompts,
    });
    controller.enabled = true;
    internals = controller as unknown as typeof internals;
    // Supply an encoded image; exercise scheduling and point mapping without
    // loading an ONNX model or rendering a labelmap in jsdom.
    internals.sessions = [
      {
        imageId,
        imageEmbeddings: {},
        canvasPosition: {
          origin: [0, 0, 0],
          rightVector: [1, 0, 0],
          downVector: [0, 1, 0],
        },
      },
    ];
    jest
      .spyOn(internals, 'getActiveSegmentation')
      .mockReturnValue({ segmentationId: 'segmentation' });
    decode = jest.spyOn(controller, 'decode').mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (internals.viewport) {
      controller.disconnectViewport(internals.viewport);
    }
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('decodes markers added before the first viewport connection', () => {
    prompts.push(marker);
    triggerEvent(eventTarget, toolsEnums.Events.ANNOTATION_ADDED, {
      annotation: marker,
    });
    jest.advanceTimersByTime(300);
    expect(decode).not.toHaveBeenCalled();

    controller.initViewport(viewport);

    expect(decode).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledWith([10, 20], [1]);
  });

  it('does not decode an empty first viewport', () => {
    controller.initViewport(viewport);

    expect(decode).not.toHaveBeenCalled();
  });

  it('keeps the first update pending while the GPU is busy', () => {
    prompts.push(marker);
    internals.isGpuInUse = true;
    controller.initViewport(viewport);
    expect(decode).not.toHaveBeenCalled();

    internals.isGpuInUse = false;
    controller.tryLoad();

    expect(decode).toHaveBeenCalledWith([10, 20], [1]);
  });

  it.each(['same', 'different'])(
    'does not decode accepted markers again on the %s viewport',
    async (target) => {
      prompts.push(marker);
      controller.initViewport(viewport);
      expect(decode).toHaveBeenCalledTimes(1);
      await Promise.resolve();

      // The controller delegates acceptance; committing voxels is outside
      // this scheduling test. The prompt remains after the preview is accepted.
      jest.spyOn(controller.tool, 'acceptPreview').mockImplementation(() => {});
      controller.acceptPreview(viewport.element);
      decode.mockClear();
      const nextViewport =
        target === 'same'
          ? viewport
          : {
              ...viewport,
              id: 'other-marker-viewport',
              element: document.createElement('div'),
            };

      controller.initViewport(nextViewport);
      controller.tryLoad();

      expect(decode).not.toHaveBeenCalled();
    }
  );

  it.each([
    toolsEnums.Events.ANNOTATION_ADDED,
    toolsEnums.Events.ANNOTATION_MODIFIED,
    toolsEnums.Events.ANNOTATION_COMPLETED,
  ])('still decodes markers on %s after connecting', (eventName) => {
    controller.initViewport(viewport);
    prompts.push(marker);

    triggerEvent(eventTarget, eventName, { annotation: marker });
    jest.advanceTimersByTime(300);

    expect(decode).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledWith([10, 20], [1]);
  });

  it('preserves an event update pending across a reconnect', () => {
    controller.initViewport(viewport);
    prompts.push(marker);
    internals.isGpuInUse = true;
    triggerEvent(eventTarget, toolsEnums.Events.ANNOTATION_MODIFIED, {
      annotation: marker,
    });
    jest.advanceTimersByTime(300);

    controller.initViewport(viewport);
    internals.isGpuInUse = false;
    controller.tryLoad();

    expect(decode).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenCalledWith([10, 20], [1]);
  });
});
