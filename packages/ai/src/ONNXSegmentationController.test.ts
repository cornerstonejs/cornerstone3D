import ONNXSegmentationController from './ONNXSegmentationController';
import { eventTarget } from '@cornerstonejs/core';
import { Events as aiEvents } from './enums';

jest.mock('onnxruntime-web/webgpu', () => ({
  __esModule: true,
  default: { env: { wasm: {} } },
}));

jest.mock('@cornerstonejs/core', () => {
  const actual = jest.requireActual('@cornerstonejs/core');
  return {
    ...actual,
    utilities: {
      ...actual.utilities,
      // jsdom cannot render a viewport to a canvas. The model failure tests
      // below bail out before any encoder feed is built, so a minimal
      // canvas position is enough.
      loadImageToCanvas: jest.fn(async () => ({
        origin: [0, 0, 0],
        rightVector: [1, 0, 0],
        downVector: [0, 1, 0],
      })),
    },
  };
});

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

/**
 * A failed model download used to be swallowed inside `load`, leaving
 * `config.encoder` unset; `handleImage` then crashed reading `feedType` off
 * `undefined` before reaching its session guard.
 */
describe('ONNXSegmentationController model loading failure', () => {
  let controller: ONNXSegmentationController;
  let logListener: ReturnType<typeof jest.fn>;
  let internals: {
    config: Record<string, unknown>;
    modelLoadError: unknown;
    viewport: {
      defaultOptions: Record<string, unknown>;
      getRenderingEngine: () => { id: string };
    };
    handleImage: (
      image: { imageId: string; sampleImageId?: string },
      imageSession: Record<string, unknown>
    ) => Promise<void>;
    load: () => Promise<void>;
    loadModels: (models: unknown, imageSession: unknown) => Promise<void>;
  };

  beforeEach(() => {
    logListener = jest.fn();
    controller = new ONNXSegmentationController({ listeners: [logListener] });
    controller.enabled = true;
    internals = controller as unknown as typeof internals;
    // No model is loaded here, so there is nothing for it to encode.
    jest.spyOn(controller, 'tryLoad').mockImplementation(() => undefined);
    // jsdom has no 2d canvas context; handleImage only needs clearRect and
    // getImageData before it bails out.
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({
        clearRect: jest.fn(),
        getImageData: jest.fn(() => ({
          width: 2,
          height: 2,
          data: new Uint8ClampedArray(16),
        })),
      } as never);
    internals.viewport = {
      defaultOptions: {},
      getRenderingEngine: () => ({ id: 'rendering-engine' }),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const makeImageSession = (overrides: Record<string, unknown> = {}) => ({
    sessionIndex: 1,
    imageId: 'other-imageId',
    sampleImageId: 'imageId:2',
    encoder: null,
    decoder: null,
    loader: Promise.resolve(),
    canvas: document.createElement('canvas'),
    ...overrides,
  });

  it('does not throw when the model failed to load and config.encoder is unset', async () => {
    internals.modelLoadError = new Error('download failed');
    internals.config = { model: 'sam_b' };

    await expect(
      internals.handleImage({ imageId: 'imageId:2' }, makeImageSession())
    ).resolves.toBeUndefined();
    expect(logListener).toHaveBeenCalledWith(
      'status',
      'No encoder session available, skipping image encoding',
      'imageId:2'
    );
  });

  it('does not throw when no encoder session exists even without a recorded failure', async () => {
    internals.config = { model: 'sam_b' };

    await expect(
      internals.handleImage({ imageId: 'imageId:2' }, makeImageSession())
    ).resolves.toBeUndefined();
    expect(logListener).toHaveBeenCalledWith(
      'status',
      'No encoder session available, skipping image encoding',
      'imageId:2'
    );
  });

  it('records the failure and triggers MODEL_LOADING_ERROR when loadModels rejects', async () => {
    const failure = new Error('model download failed');
    jest.spyOn(internals, 'loadModels').mockRejectedValue(failure);
    const listener = jest.fn();
    eventTarget.addEventListener(aiEvents.MODEL_LOADING_ERROR, listener);

    try {
      await internals.load();
    } finally {
      eventTarget.removeEventListener(aiEvents.MODEL_LOADING_ERROR, listener);
    }

    expect(internals.modelLoadError).toBe(failure);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({
      modelConfig: 'sam_b',
      error: failure,
    });
  });
});
