jest.mock('@cornerstonejs/core', () => ({
  ...jest.requireActual('@cornerstonejs/core'),
  getEnabledElementByViewportId: jest.fn(),
}));

import {
  cache,
  getEnabledElementByViewportId,
  imageLoader,
  init,
  metaData,
  setRenderBackend,
  displaySetRegistry,
  utilities,
} from '@cornerstonejs/core';
import { describe, it, expect, afterEach, beforeAll } from '@jest/globals';
import { createPlanarViewportOnStandInEngine } from '../../core/test/utils/planarViewportOnStandInEngine';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import { addSegmentations } from '../src/stateManagement/segmentation/addSegmentations';
import {
  removeSegmentation,
  removeAllSegmentations,
} from '../src/stateManagement/segmentation/removeSegmentation';
import { getSegmentation } from '../src/stateManagement/segmentation/getSegmentation';
import { getCurrentLabelmapImageIdsForViewport } from '../src/stateManagement/segmentation/getCurrentLabelmapImageIdForViewport';
import { updateLabelmapSegmentationImageReferences } from '../src/stateManagement/segmentation/updateLabelmapSegmentationImageReferences';
import { getCurrentStackLabelmapImages } from '../src/tools/displayTools/Labelmap/syncStackLabelmapActors';
import { getLabelmaps } from '../src/stateManagement/segmentation/labelmapModel';
import { SegmentationRepresentations } from '../src/enums';

const FRAME_OF_REFERENCE_UID = 'labelmapReferences-frame';
const SEGMENTATION_ID = 'labelmapReferences';

/** Gives an element its size, as the browser would after layout. */
function setSize(element, width, height) {
  Object.defineProperty(element, 'offsetWidth', { value: width });
  Object.defineProperty(element, 'offsetHeight', { value: height });
  Object.defineProperty(element, 'clientWidth', { value: width });
  Object.defineProperty(element, 'clientHeight', { value: height });
  Object.defineProperty(element, 'getBoundingClientRect', {
    value: () => ({ width, height }),
  });
}

/**
 * Image ids of the fake loader, 16 by 16 axial images at the given
 * positions along z: the stack has one per millimetre, a labelmap of another
 * spacing names its own positions.
 */
function createImageIds(name, positions) {
  return positions.map(
    (z) =>
      `fakeImageLoader:${encodeURIComponent(
        JSON.stringify({
          loader: 'fakeImageLoader',
          name,
          rows: 16,
          columns: 16,
          barStart: 2,
          barWidth: 4,
          xSpacing: 1,
          ySpacing: 1,
          sliceIndex: z,
        })
      )}`
  );
}

function range(start, end, step = 1) {
  return Array.from(
    { length: Math.ceil((end - start) / step) },
    (_, index) => start + index * step
  );
}

/** The image plane of each image with the frame of reference of the stack. */
function framedPlaneProvider(type, imageId) {
  if (type !== 'imagePlaneModule' || !imageId.startsWith('fakeImageLoader')) {
    return;
  }

  const plane = fakeMetaDataProvider(type, imageId);

  return plane && { ...plane, frameOfReferenceUID: FRAME_OF_REFERENCE_UID };
}

/**
 * A metadata provider ahead of all others that counts the calls and answers
 * none, so that the other providers answer.
 */
function addCountingProvider() {
  const counter = { calls: 0 };

  metaData.addProvider(() => {
    counter.calls++;
  }, 1000000);

  return counter;
}

/** Labelmap images made from images of the stack, as an application does. */
function deriveLabelmapImageIds(stackImageIds) {
  return imageLoader
    .createAndCacheDerivedLabelmapImages(stackImageIds)
    .map((image) => image.imageId);
}

/**
 * Labelmap images of their own geometry, as the frames of a SEG of another
 * spacing: the image ids of the fake loader at their own positions, cached.
 */
async function createOwnLabelmapImageIds(name, positions) {
  const imageIds = createImageIds(name, positions);

  await Promise.all(
    imageIds.map((imageId) => imageLoader.loadAndCacheImage(imageId))
  );

  return imageIds;
}

function addLabelmapSegmentation(labelmaps) {
  const layers = Object.fromEntries(
    labelmaps.map(({ imageIds, referencedImageIds }, index) => [
      `layer-${index}`,
      {
        labelmapId: `layer-${index}`,
        storageKind: 'stack',
        imageIds,
        ...(referencedImageIds ? { referencedImageIds } : {}),
        labelToSegmentIndex: { 1: index + 1 },
      },
    ])
  );

  addSegmentations([
    {
      segmentationId: SEGMENTATION_ID,
      representation: {
        type: SegmentationRepresentations.Labelmap,
        data: {
          imageIds: labelmaps[0].imageIds,
          labelmaps: layers,
          primaryLabelmapId: 'layer-0',
        },
      },
    },
  ]);
}

/**
 * The labelmap images of the image on display as they were found before the
 * map of the stack, by a pass over the labelmap images: for each layer, the
 * images that reference the image, else the image at its index in the stack,
 * else the first image of the layer that the viewport takes as an overlay;
 * and the last of all labelmap images that the viewport takes as an overlay.
 */
function scanLabelmapImages(viewport) {
  const imageId = viewport.getCurrentImageId();
  const currentIndex = viewport.getImageIds().indexOf(imageId);
  const layers = getLabelmaps(getSegmentation(SEGMENTATION_ID));
  const isOverlay = (labelmapImageId) =>
    viewport.isReferenceViewable(
      { referencedImageId: labelmapImageId },
      { asOverlay: true }
    );
  const current = [];

  layers.forEach((layer) => {
    const referenced = (layer.imageIds ?? []).filter(
      (labelmapImageId, index) =>
        labelmapImageId &&
        (layer.referencedImageIds ?? layer.imageIds)[index] === imageId
    );

    if (referenced.length) {
      current.push(...referenced);
    } else if (currentIndex !== -1 && layer.imageIds?.[currentIndex]) {
      current.push(layer.imageIds[currentIndex]);
    } else {
      const overlay = layer.imageIds?.find(isOverlay);

      if (overlay) {
        current.push(overlay);
      }
    }
  });

  const all = Array.from(
    new Set(layers.flatMap((layer) => layer.imageIds ?? []).filter(Boolean))
  );

  return {
    current: Array.from(new Set(current)),
    reference: all.filter(isOverlay).pop(),
  };
}

function resolveLabelmapImages(viewport) {
  return {
    current: getCurrentLabelmapImageIdsForViewport(
      viewport.id,
      SEGMENTATION_ID
    ),
    reference: updateLabelmapSegmentationImageReferences(
      viewport.id,
      SEGMENTATION_ID
    ),
  };
}

describe('The labelmap images of the images of a stack', () => {
  let renderingEngine;

  beforeAll(() => {
    window.devicePixelRatio = 1;
    init({});
  });

  afterEach(() => {
    removeAllSegmentations();
    renderingEngine?.destroy();
    renderingEngine = undefined;
    setRenderBackend('auto');
    cache.purgeCache();
    displaySetRegistry.clear();
    metaData.removeAllProviders();
  });

  async function showStack(viewport, stackImageIds, initialImageIdIndex = 0) {
    const displaySetId = `stack-${stackImageIds.length}-${stackImageIds[0]}`;

    displaySetRegistry.add(displaySetId, { imageIds: stackImageIds });
    await viewport.setDisplaySets({
      displaySetId,
      options: { mode: 'stack', initialImageIdIndex },
    });
  }

  async function mount(stackImageIds, initialImageIdIndex = 0) {
    setRenderBackend('cpu');
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);
    metaData.addProvider(framedPlaneProvider, 20000);
    metaData.addProvider(
      utilities.genericMetadataProvider.get.bind(
        utilities.genericMetadataProvider
      ),
      30000
    );

    const element = document.createElement('div');

    document.body.appendChild(element);
    setSize(element, 64, 64);

    let viewport;

    ({ renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      element,
      'labelmapReferences'
    ));
    getEnabledElementByViewportId.mockImplementation((viewportId) =>
      viewportId === viewport.id
        ? { viewport, renderingEngine, viewportId }
        : undefined
    );
    await showStack(viewport, stackImageIds, initialImageIdIndex);

    return viewport;
  }

  function unmount() {
    removeAllSegmentations();
    renderingEngine.destroy();
    renderingEngine = undefined;
    metaData.removeAllProviders();
  }

  /**
   * The labelmap images shown at each image of a scroll of the stack, with
   * the metadata reads and the reference checks that the scroll asks of the
   * labelmap at that image: the labelmap images of the image on display, by
   * layer, and the labelmap image that the viewport takes as an overlay of it.
   */
  async function scrollThrough(viewport, sliceIndices) {
    const counter = addCountingProvider();
    const { isReferenceViewable, getReferenceViewableCheck } = viewport;
    let checks = 0;

    viewport.isReferenceViewable = (...args) => {
      checks++;
      return isReferenceViewable.apply(viewport, args);
    };
    viewport.getReferenceViewableCheck = () => {
      const check = getReferenceViewableCheck.call(viewport);

      return (...args) => {
        checks++;
        return check(...args);
      };
    };

    getCurrentStackLabelmapImages(viewport.id, SEGMENTATION_ID);
    updateLabelmapSegmentationImageReferences(viewport.id, SEGMENTATION_ID);

    const shown = [];
    const costs = [];

    for (const sliceIndex of sliceIndices) {
      await viewport.setImageIdIndex(sliceIndex);
      counter.calls = 0;
      checks = 0;
      shown.push(
        getCurrentStackLabelmapImages(viewport.id, SEGMENTATION_ID).map(
          ({ imageId }) => imageId
        )
      );
      updateLabelmapSegmentationImageReferences(viewport.id, SEGMENTATION_ID);
      costs.push({ metadataReads: counter.calls, checks });
    }

    return { shown, costs };
  }

  it('reads as much at a scroll with a labelmap of 10 images as with one of 300', async () => {
    const stackImageIds = createImageIds('stack', range(0, 300));
    const scroll = async (labelmapCount) => {
      const viewport = await mount(stackImageIds);
      const labelmapImageIds = deriveLabelmapImageIds(
        stackImageIds.slice(0, labelmapCount)
      );

      addLabelmapSegmentation([{ imageIds: labelmapImageIds }]);

      const { shown, costs } = await scrollThrough(viewport, range(1, 10));

      unmount();

      return { labelmapImageIds, shown, costs };
    };
    const few = await scroll(10);
    const many = await scroll(300);

    expect(few.shown).toEqual(
      range(1, 10).map((index) => [few.labelmapImageIds[index]])
    );
    expect(many.shown).toEqual(
      range(1, 10).map((index) => [many.labelmapImageIds[index]])
    );
    expect(many.costs).toEqual(few.costs);
  });

  it('reads as much at a scroll that finds the labelmap image by its plane with a labelmap of 10 images as with one of 150', async () => {
    const stackImageIds = createImageIds('stack', range(0, 300));
    const scroll = async (labelmapCount) => {
      const viewport = await mount(stackImageIds, 200);
      const labelmapImageIds = await createOwnLabelmapImageIds(
        `other-spacing-${labelmapCount}`,
        range(300 - 2 * labelmapCount, 300, 2)
      );

      addLabelmapSegmentation([{ imageIds: labelmapImageIds }]);

      const { shown, costs } = await scrollThrough(viewport, range(290, 300));

      unmount();

      return { shown: shown.map((imageIds) => imageIds.length), costs };
    };
    const few = await scroll(10);
    const many = await scroll(150);

    expect(few.shown).toEqual([1, 0, 1, 0, 1, 0, 1, 0, 1, 0]);
    expect(many.shown).toEqual(few.shown);
    expect(many.costs).toEqual(few.costs);
  });

  it.each([
    [
      'a labelmap that covers part of the stack',
      async (stackImageIds) => [
        { imageIds: deriveLabelmapImageIds(stackImageIds.slice(20, 40)) },
      ],
    ],
    [
      'a labelmap of another slice spacing',
      async () => [
        {
          imageIds: await createOwnLabelmapImageIds(
            'every-other',
            range(0, 60, 2)
          ),
        },
      ],
    ],
    [
      'overlapping labelmaps, one with its referenced images and one found by its planes',
      async (stackImageIds) => [
        {
          imageIds: deriveLabelmapImageIds(stackImageIds.slice(10, 30)),
          referencedImageIds: stackImageIds.slice(10, 30),
        },
        {
          imageIds: await createOwnLabelmapImageIds(
            'overlap',
            range(20, 100, 2)
          ),
        },
      ],
    ],
  ])(
    'are those that a pass over the labelmap images gave, on every image, for %s',
    async (_, createLabelmaps) => {
      const stackImageIds = createImageIds('stack', range(0, 50));
      const viewport = await mount(stackImageIds);

      addLabelmapSegmentation(await createLabelmaps(stackImageIds));

      const differences = [];
      let found = 0;

      for (const sliceIndex of range(0, 50)) {
        await viewport.setImageIdIndex(sliceIndex);

        const resolved = resolveLabelmapImages(viewport);
        const scanned = scanLabelmapImages(viewport);

        if (
          JSON.stringify(resolved) !== JSON.stringify(scanned) ||
          JSON.stringify(resolveLabelmapImages(viewport)) !==
            JSON.stringify(resolved)
        ) {
          differences.push({ sliceIndex, resolved, scanned });
        }

        found += resolved.current.length;
      }

      expect(differences).toEqual([]);
      expect(found).toBeGreaterThan(0);
    }
  );

  it('follows a change of the images of the stack', async () => {
    const stackImageIds = createImageIds('stack', range(0, 30));
    const viewport = await mount(stackImageIds, 5);
    const labelmapImageIds = await createOwnLabelmapImageIds(
      'own',
      range(0, 30)
    );

    addLabelmapSegmentation([{ imageIds: labelmapImageIds }]);
    expect(resolveLabelmapImages(viewport)).toEqual({
      current: [labelmapImageIds[5]],
      reference: labelmapImageIds[5],
    });

    await showStack(viewport, stackImageIds.slice(10).reverse(), 0);

    expect(viewport.getCurrentImageId()).toBe(stackImageIds[29]);
    expect(resolveLabelmapImages(viewport)).toEqual({
      current: [labelmapImageIds[0]],
      reference: labelmapImageIds[29],
    });
    expect(resolveLabelmapImages(viewport)).toEqual(
      scanLabelmapImages(viewport)
    );
  });

  it('follows labelmap images that a layer gets or loses, as a brush that adds the image of a new slice', async () => {
    const stackImageIds = createImageIds('stack', range(0, 30));
    const viewport = await mount(stackImageIds, 20);
    const labelmapImageIds = deriveLabelmapImageIds(stackImageIds.slice(0, 5));

    addLabelmapSegmentation([
      {
        imageIds: labelmapImageIds,
        referencedImageIds: stackImageIds.slice(0, 5),
      },
    ]);
    expect(resolveLabelmapImages(viewport)).toEqual({
      current: [],
      reference: undefined,
    });

    const [layer] = getLabelmaps(getSegmentation(SEGMENTATION_ID));
    const [newImageId] = deriveLabelmapImageIds([stackImageIds[20]]);

    layer.imageIds.push(newImageId);
    layer.referencedImageIds.push(stackImageIds[20]);
    expect(resolveLabelmapImages(viewport)).toEqual({
      current: [newImageId],
      reference: newImageId,
    });

    layer.imageIds.pop();
    layer.referencedImageIds.pop();
    expect(resolveLabelmapImages(viewport)).toEqual({
      current: [],
      reference: undefined,
    });
  });

  it('forgets the labelmap images of a segmentation that is removed', async () => {
    const stackImageIds = createImageIds('stack', range(0, 30));
    const viewport = await mount(stackImageIds, 3);
    const first = deriveLabelmapImageIds(stackImageIds);

    addLabelmapSegmentation([{ imageIds: first }]);
    expect(resolveLabelmapImages(viewport)).toEqual({
      current: [first[3]],
      reference: first[3],
    });

    removeSegmentation(SEGMENTATION_ID);

    const second = deriveLabelmapImageIds(stackImageIds);

    addLabelmapSegmentation([{ imageIds: second }]);
    expect(resolveLabelmapImages(viewport)).toEqual({
      current: [second[3]],
      reference: second[3],
    });
  });
});
