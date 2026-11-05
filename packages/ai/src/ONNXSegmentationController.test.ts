import ONNXSegmentationController from './ONNXSegmentationController';

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
