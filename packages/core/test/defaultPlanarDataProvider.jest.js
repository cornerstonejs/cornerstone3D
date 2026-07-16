jest.mock('../src/loaders/volumeLoader', () => ({
  __esModule: true,
  createAndCacheVolume: jest.fn(),
}));

jest.mock('../src/loaders/imageLoader', () => ({
  __esModule: true,
  loadAndCacheImage: jest.fn(async (imageId) => ({ imageId })),
}));

jest.mock(
  '../src/RenderingEngine/GenericViewport/genericViewportDisplaySetAccess',
  () => ({
    __esModule: true,
    getGenericViewportPlanarDisplaySet: jest.fn(),
  })
);

import { ActorRenderMode } from '../src/types';
import { createAndCacheVolume } from '../src/loaders/volumeLoader';
import { getGenericViewportPlanarDisplaySet } from '../src/RenderingEngine/GenericViewport/genericViewportDisplaySetAccess';
import { DefaultPlanarDataProvider } from '../src/RenderingEngine/GenericViewport/Planar/DefaultPlanarDataProvider';

const DATA_ID = 'display-set-1';

function makeImageIds(count) {
  return Array.from({ length: count }, (_, i) => `wadors:image-${i}`);
}

function registerDataSet(dataSet) {
  getGenericViewportPlanarDisplaySet.mockReturnValue(dataSet);
}

function mockVolume(imageIds) {
  createAndCacheVolume.mockResolvedValue({
    imageIds,
    load: jest.fn(),
  });
}

describe('DefaultPlanarDataProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('volume-slice payloads', () => {
    it('remaps initialImageIdIndex when the volume reorders the imageIds', async () => {
      // The registered dataSet carries the caller's ordering; the cached volume
      // sorts by position along the scan axis, here the exact reverse.
      const dataSetImageIds = makeImageIds(30);
      registerDataSet({ imageIds: dataSetImageIds, initialImageIdIndex: 12 });
      mockVolume([...dataSetImageIds].reverse());

      const provider = new DefaultPlanarDataProvider();
      const payload = await provider.load(DATA_ID, {
        orientation: 'acquisition',
        renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
        volumeId: 'volume-1',
      });

      // Index 12 in dataSet order is imageId image-12; in the reversed volume
      // ordering that image sits at index 17 — the payload must address it there,
      // not land on the mirrored slice.
      expect(payload.imageIds[payload.initialImageIdIndex]).toBe(
        'wadors:image-12'
      );
      expect(payload.initialImageIdIndex).toBe(17);
    });

    it('keeps the index unchanged when the volume preserves the ordering', async () => {
      const dataSetImageIds = makeImageIds(10);
      registerDataSet({ imageIds: dataSetImageIds, initialImageIdIndex: 3 });
      mockVolume([...dataSetImageIds]);

      const provider = new DefaultPlanarDataProvider();
      const payload = await provider.load(DATA_ID, {
        orientation: 'acquisition',
        renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
        volumeId: 'volume-1',
      });

      expect(payload.initialImageIdIndex).toBe(3);
    });

    it('warns and keeps the original index when the imageId is not in the volume', async () => {
      const dataSetImageIds = makeImageIds(10);
      registerDataSet({ imageIds: dataSetImageIds, initialImageIdIndex: 3 });
      mockVolume(makeImageIds(10).map((id) => `${id}-other`));
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        const provider = new DefaultPlanarDataProvider();
        const payload = await provider.load(DATA_ID, {
          orientation: 'acquisition',
          renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
          volumeId: 'volume-1',
        });

        expect(payload.initialImageIdIndex).toBe(3);
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('initialImageIdIndex remap failed')
        );
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('preserves "no slice requested" (undefined) so the view can center', async () => {
      const dataSetImageIds = makeImageIds(10);
      registerDataSet({ imageIds: dataSetImageIds });
      mockVolume([...dataSetImageIds].reverse());

      const provider = new DefaultPlanarDataProvider();
      const payload = await provider.load(DATA_ID, {
        orientation: 'acquisition',
        renderMode: ActorRenderMode.VTK_VOLUME_SLICE,
        volumeId: 'volume-1',
      });

      expect(payload.initialImageIdIndex).toBeUndefined();
    });
  });

  describe('image payloads', () => {
    it('keeps the dataSet ordering and index on the image branch', async () => {
      const dataSetImageIds = makeImageIds(5);
      registerDataSet({ imageIds: dataSetImageIds, initialImageIdIndex: 2 });

      const provider = new DefaultPlanarDataProvider();
      const payload = await provider.load(DATA_ID, {
        orientation: 'acquisition',
        renderMode: ActorRenderMode.VTK_IMAGE,
        volumeId: undefined,
      });

      expect(payload.imageIds).toEqual(dataSetImageIds);
      expect(payload.initialImageIdIndex).toBe(2);
      expect(payload.image.imageId).toBe('wadors:image-2');
    });
  });
});
