import {
  displaySetRegistry,
  metaData,
  registerDisplaySetProviders,
  registerDisplaySetMetadata,
} from '@cornerstonejs/metadata';
import {
  getDisplaySetImageId,
  getImageDisplaySet,
  getWSIDisplaySet,
} from '../src/RenderingEngine/Viewports/displaySetAccess';

const displaySet = (displaySetId, extra = {}) => ({
  displaySetId,
  isDisplayable: true,
  instances: [],
  imageIds: [`${displaySetId}:frame1`, `${displaySetId}:frame2`],
  underlyingImageIds: [`${displaySetId}:instance`],
  ...extra,
});

describe('Display set lookup by display set id', () => {
  beforeAll(() => {
    metaData.addProvider(metaData.metadataModuleProvider, -1000);
    registerDisplaySetProviders();
  });

  afterEach(() => {
    displaySetRegistry.clear();
  });

  it('loads a registered IDisplaySet in every viewport family', () => {
    registerDisplaySetMetadata([], displaySet('ds-1'));

    expect(getImageDisplaySet('ds-1').imageIds).toEqual([
      'ds-1:frame1',
      'ds-1:frame2',
    ]);
    expect(getImageDisplaySet('ds-1').imageIds).toHaveLength(2);
    // Video and ECG show the first instance.
    expect(getDisplaySetImageId('ds-1')).toBe('ds-1:instance');
  });

  it('loads an OHIF display set, added under its displaySetInstanceUID', () => {
    const ohifDisplaySet = {
      displaySetInstanceUID: 'uid-2',
      imageIds: ['video:1'],
      instance: { imageId: 'video:1' },
    };
    displaySetRegistry.add('uid-2', ohifDisplaySet);

    expect(getDisplaySetImageId('uid-2')).toBe('video:1');
    expect(getImageDisplaySet('uid-2')).toBe(ohifDisplaySet);
  });

  it('does not load a display set that was written to the cache but not added', () => {
    metaData.addTyped('displaySetModule', 'uid-8', {
      displaySet: {
        displaySetInstanceUID: 'uid-8',
        imageIds: ['video:8'],
        instance: { imageId: 'video:8' },
      },
    });

    expect(getImageDisplaySet('uid-8')).toBeUndefined();
    expect(getDisplaySetImageId('uid-8')).toBe('uid-8');
  });

  it('does not take a display set that the cache holds under an image id', () => {
    registerDisplaySetMetadata(['ecg:imageId'], displaySet('ds-3'));

    // The ECG example opens an instance by its image id. That id is not a
    // display set id, so the source stays the image id.
    expect(getDisplaySetImageId('ecg:imageId')).toBe('ecg:imageId');
    expect(getImageDisplaySet('ecg:imageId')).toBeUndefined();
  });

  it('shows the instance of a video or ECG display set', () => {
    registerDisplaySetMetadata(
      [],
      displaySet('ds-6', { instance: { imageId: 'ds-6:shown' } })
    );

    expect(getDisplaySetImageId('ds-6')).toBe('ds-6:shown');
  });

  it('loads a WSI display set with its own web client', () => {
    const webClient = { getDICOMwebMetadata: () => undefined };
    registerDisplaySetMetadata([], displaySet('ds-4', { webClient }));

    expect(getWSIDisplaySet('ds-4')).toEqual({
      imageIds: ['ds-4:frame1', 'ds-4:frame2'],
      options: { miniNavigationOverlay: undefined, webClient },
    });
  });

  it('loads a WSI display set with the WADO_WEB_CLIENT of its first image', () => {
    const webClient = { getDICOMwebMetadata: () => undefined };
    const provider = (type, imageId) =>
      type === 'wadoWebClient' && imageId === 'ds-7:frame1'
        ? webClient
        : undefined;
    metaData.addProvider(provider, 100000);
    registerDisplaySetMetadata([], displaySet('ds-7'));

    expect(getWSIDisplaySet('ds-7').options.webClient).toBe(webClient);
    metaData.removeProvider(provider);
  });

  it('loads what was added last under an id: one store, no precedence', () => {
    registerDisplaySetMetadata([], displaySet('ds-5'));
    displaySetRegistry.add('ds-5', { imageIds: ['registry:1'] });

    expect(getImageDisplaySet('ds-5').imageIds).toEqual(['registry:1']);

    registerDisplaySetMetadata([], displaySet('ds-5'));

    expect(getImageDisplaySet('ds-5').imageIds).toEqual([
      'ds-5:frame1',
      'ds-5:frame2',
    ]);
  });
});
