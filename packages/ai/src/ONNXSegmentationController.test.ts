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
    getCurrentImageId: () => 'imageId:2',
    getViewReferenceId: () => undefined,
    getCurrentImageIdIndex: () => 1,
    getImageIds: () => ['imageId:1', 'imageId:2', 'imageId:3'],
  };

  it('renders a viewport with no active segmentation without throwing', () => {
    const controller = new ONNXSegmentationController({
      autoSegmentMode: true,
    });
    controller.enabled = true;
    const internals = controller as unknown as {
      viewport: typeof viewportWithoutSegmentation;
      viewportRenderedListener: (event?: unknown) => void;
    };
    internals.viewport = viewportWithoutSegmentation;

    expect(() => internals.viewportRenderedListener()).not.toThrow();
  });

  it('does not carry propagation points over to the next viewport', () => {
    const controller = new ONNXSegmentationController({
      autoSegmentMode: true,
    });
    const internals = controller as unknown as { randomPoints: unknown[] };
    // Left over from painting on the previous viewport; decoding them against
    // the next one previews into a segmentation that viewport may not have.
    internals.randomPoints = [[10, 20, 30]];
    // No model is loaded here, so there is nothing for it to encode.
    jest.spyOn(controller, 'tryLoad').mockImplementation(() => undefined);

    controller.initViewport({
      ...viewportWithoutSegmentation,
      element: document.createElement('div'),
    });

    expect(internals.randomPoints).toEqual([]);
  });
});
