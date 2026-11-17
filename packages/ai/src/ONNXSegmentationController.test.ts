import { cache } from '@cornerstonejs/core';
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

/**
 * A view of a volume that shows no single image has a view reference id that
 * starts with `volumeId:`. The controller then takes the first image of the
 * volume as its sample image. A next planar viewport takes no argument in
 * `getImageIds`, so the image ids come from the volume of the cache.
 */
describe('ONNXSegmentationController sample image of a volume view', () => {
  const volumeImageIds = ['volume:0', 'volume:1'];
  let controller: ONNXSegmentationController;
  let internals: {
    viewport: unknown;
    desiredImage: { imageId?: string; sampleImageId?: string };
    viewportRenderedListener: (event?: unknown) => void;
  };
  let getImageIds: jest.Mock;
  let viewport: Record<string, unknown>;

  beforeEach(() => {
    controller = new ONNXSegmentationController({ autoSegmentMode: true });
    controller.enabled = true;
    internals = controller as unknown as typeof internals;
    getImageIds = jest.fn(() => ['source:0', 'source:1']);
    viewport = {
      id: 'volume-view',
      element: document.createElement('div'),
      getCurrentImageId: () => undefined,
      getViewReferenceId: () =>
        'volumeId:volume-1?sliceIndex=3&viewPlaneNormal=1.000,0.000,0.000',
      getCurrentImageIdIndex: () => 3,
      getVolumeId: () => 'volume-1',
      getImageIds,
    };
    jest.spyOn(controller, 'tryLoad').mockImplementation(() => undefined);
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

  it('takes the first image of the volume of the cache, and gives getImageIds no argument', () => {
    const getVolume = jest
      .spyOn(cache, 'getVolume')
      .mockReturnValue({ imageIds: volumeImageIds } as never);

    controller.initViewport(viewport);

    expect(internals.desiredImage.sampleImageId).toBe('volume:0');

    internals.desiredImage.sampleImageId = undefined;
    internals.viewportRenderedListener();

    expect(internals.desiredImage.sampleImageId).toBe('volume:0');
    expect(getVolume).toHaveBeenCalledWith('volume-1');
    expect(getImageIds.mock.calls.every((args) => args.length === 0)).toBe(
      true
    );
  });

  it('takes the first image id of the viewport when the volume is not in the cache', () => {
    jest.spyOn(cache, 'getVolume').mockReturnValue(undefined as never);

    controller.initViewport(viewport);
    internals.viewportRenderedListener();

    expect(internals.desiredImage.sampleImageId).toBe('source:0');
    expect(getImageIds.mock.calls.every((args) => args.length === 0)).toBe(
      true
    );
  });
});
