import { describe, it, expect, jest, afterEach } from '@jest/globals';
import {
  displaySetRegistry,
  Enums as MetadataEnums,
  metaData as metadataMetaData,
  registerDisplaySetMetadata,
  registerDisplaySetProviders,
  utilities as metadataUtilities,
} from '@cornerstonejs/metadata';
import {
  fakeImageLoader,
  fakeMetaDataProvider,
} from '../../../utils/test/testUtilsImageLoader';
import * as core from '../src/index';
import { init, resetInitialization } from '../src/init';
import cache from '../src/cache/cache';
import * as imageLoader from '../src/loaders/imageLoader';
import * as metaData from '../src/metaData';
import { createPlanarViewportOnStandInEngine } from './utils/planarViewportOnStandInEngine';

jest.mock('../src/utilities/renderingCapabilities', () => {
  const actual = jest.requireActual('../src/utilities/renderingCapabilities');

  return {
    ...actual,
    getRenderingCapabilities: () => ({
      webgl: false,
      maxTextureSize: 0,
      max3DTextureSize: 0,
      renderer: '',
      softwareRasterizer: false,
      webglCanvasCopy: false,
      norm16: false,
      norm16Linear: false,
      float: false,
      floatLinear: false,
      halfFloat: false,
      halfFloatLinear: false,
    }),
  };
});

const DISPLAY_SET = MetadataEnums.MetadataModules.DISPLAY_SET;

/** Three 16 by 16 images of the fake image loader. */
function createImageIds(name) {
  return [0, 1, 2].map(
    (sliceIndex) =>
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
          sliceIndex,
        })
      )}`
  );
}

/** Gives an element of 64 by 64 pixels in the document. */
function createElement() {
  const element = document.createElement('div');

  ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight'].forEach(
    (key) => Object.defineProperty(element, key, { value: 64 })
  );
  document.body.appendChild(element);

  return element;
}

/**
 * A display set as OHIF makes it: keyed by `displaySetInstanceUID`, with no
 * `displaySetId`, frozen so that a write to it throws.
 */
function createOhifDisplaySet(displaySetInstanceUID, imageIds) {
  return Object.freeze({
    displaySetInstanceUID,
    StudyInstanceUID: 'ohif-study',
    SeriesInstanceUID: `${displaySetInstanceUID}-series`,
    Modality: 'CT',
    SeriesDescription: 'OHIF series',
    imageIds,
    instances: Object.freeze(
      imageIds.map((imageId, index) =>
        Object.freeze({ imageId, SOPInstanceUID: `sop-${index}` })
      )
    ),
    isReconstructable: false,
    viewportType: 'stack',
    getThumbnailSrc: () => Promise.resolve(''),
  });
}

/**
 * OHIF's display set store as task O2 writes it: one add when the display
 * set is made, and reads of the `DISPLAY_SET` module by its UID.
 */
const ohifDisplaySetStore = {
  setDisplaySet(displaySet) {
    displaySetRegistry.add(displaySet.displaySetInstanceUID, displaySet);
  },
  getDisplaySet(uid) {
    return metadataUtilities.getCacheData(DISPLAY_SET, uid);
  },
};

describe('One display set store, in @cornerstonejs/metadata', () => {
  let engines = [];

  function mountPlanarViewport(viewportId) {
    resetInitialization();
    init();
    window.devicePixelRatio = 1;
    imageLoader.registerImageLoader('fakeImageLoader', fakeImageLoader);
    metaData.addProvider(fakeMetaDataProvider, 10000);

    const { renderingEngine, viewport } = createPlanarViewportOnStandInEngine(
      createElement(),
      viewportId
    );

    engines.push(renderingEngine);

    return viewport;
  }

  afterEach(() => {
    engines.forEach((engine) => engine.destroy());
    engines = [];
    cache.purgeCache();
    metaData.removeAllProviders();
    imageLoader.unregisterAllImageLoaders();
    displaySetRegistry.clear();
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    resetInitialization();
  });

  it('is the displaySetRegistry that @cornerstonejs/core exports', () => {
    expect(core.displaySetRegistry).toBe(displaySetRegistry);
  });

  it('mounts a display set that OHIF wrote, with no second registration and no change to it', async () => {
    const uid = '1.2.840.ohif.display-set';
    const imageIds = createImageIds('ohifDisplaySet');
    const displaySet = createOhifDisplaySet(uid, imageIds);
    const keys = Object.keys(displaySet);
    const add = jest.spyOn(displaySetRegistry, 'add');

    ohifDisplaySetStore.setDisplaySet(displaySet);

    const viewport = mountPlanarViewport('ohifPath:planar');

    await viewport.setDisplaySets({ displaySetId: uid });

    expect(add).toHaveBeenCalledTimes(1);
    expect(
      viewport.getDisplaySets().map(({ displaySetId }) => displaySetId)
    ).toEqual([uid]);
    expect(
      viewport.getRenderPlan().map(({ displaySetId }) => displaySetId)
    ).toEqual([uid]);
    expect(viewport.getCurrentImageId()).toBe(imageIds[0]);
    expect(viewport.getImageIds()).toEqual(imageIds);
    expect(displaySetRegistry.get(uid)).toBe(displaySet);
    expect(ohifDisplaySetStore.getDisplaySet(uid)).toBe(displaySet);
    expect(Object.keys(displaySet)).toEqual(keys);
    expect('displaySetId' in displaySet).toBe(false);
  });

  it('gives OHIF the object that the viewport mounted through metaData.getTyped', () => {
    metadataMetaData.addProvider(
      metadataMetaData.metadataModuleProvider,
      -1000
    );
    registerDisplaySetProviders();

    const uid = '1.2.840.ohif.typed';
    const displaySet = createOhifDisplaySet(uid, createImageIds('ohifTyped'));

    ohifDisplaySetStore.setDisplaySet(displaySet);

    expect(metadataMetaData.getTyped(DISPLAY_SET, uid)).toBe(displaySet);
  });

  it('mounts an IDisplaySet by its displaySetId and not by an image id that registerDisplaySetMetadata stored it under', async () => {
    const imageIds = createImageIds('registeredIDisplaySet');
    const displaySet = {
      displaySetId: 'cs:display-set',
      isDisplayable: true,
      instances: [],
      imageIds,
      underlyingImageIds: ['cs:instance'],
    };

    registerDisplaySetMetadata(['cs:series-image'], displaySet);

    const viewport = mountPlanarViewport('aliases:planar');

    await expect(
      viewport.setDisplaySets({ displaySetId: 'cs:series-image' })
    ).rejects.toThrow('cs:series-image');

    await viewport.setDisplaySets({ displaySetId: 'cs:display-set' });

    expect(viewport.getImageIds()).toEqual(imageIds);
    expect(metadataUtilities.getCacheData(DISPLAY_SET, 'cs:series-image')).toBe(
      displaySet
    );
  });

  it('keeps a registration through cache.purgeCache()', async () => {
    const imageIds = createImageIds('purgedImages');
    const descriptor = { imageIds };

    displaySetRegistry.add('purge:display-set', descriptor);

    const viewport = mountPlanarViewport('purge:planar');

    await viewport.setDisplaySets({ displaySetId: 'purge:display-set' });
    cache.purgeCache();

    expect(cache.getImageLoadObject(imageIds[0])).toBeUndefined();
    expect(displaySetRegistry.has('purge:display-set')).toBe(true);
    expect(displaySetRegistry.get('purge:display-set')).toBe(descriptor);
    expect(
      metadataUtilities.getCacheData(DISPLAY_SET, 'purge:display-set')
    ).toBe(descriptor);
  });

  it('loses every registration with the metadata cache: utilities.clearCacheData()', () => {
    const descriptor = { imageIds: createImageIds('clearedMetadata') };

    displaySetRegistry.add('cleared:display-set', descriptor);
    metadataUtilities.clearCacheData();

    expect(displaySetRegistry.has('cleared:display-set')).toBe(false);
    expect(displaySetRegistry.get('cleared:display-set')).toBeUndefined();

    displaySetRegistry.add('cleared:display-set', descriptor);

    expect(displaySetRegistry.get('cleared:display-set')).toBe(descriptor);
  });
});
