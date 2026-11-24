import {
  metaData,
  registerDisplaySetProviders,
  registerDisplaySetMetadata,
} from '@cornerstonejs/metadata';
import {
  getDisplaySetImageId,
  getImageDisplaySet,
  getWSIDisplaySet,
} from '../src/RenderingEngine/Viewports/displaySetAccess';
import displaySetRegistry from '../src/RenderingEngine/Viewports/displaySetRegistry';

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

  it('loads an OHIF display set, keyed by displaySetInstanceUID', () => {
    metaData.addTyped('displaySetModule', 'uid-2', {
      displaySet: {
        displaySetInstanceUID: 'uid-2',
        imageIds: ['video:1'],
      },
    });

    expect(getDisplaySetImageId('uid-2')).toBe('video:1');
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

  it('uses the viewport registry first', () => {
    registerDisplaySetMetadata([], displaySet('ds-5'));
    displaySetRegistry.add('ds-5', { imageIds: ['registry:1'] });

    expect(getImageDisplaySet('ds-5').imageIds).toEqual(['registry:1']);
    displaySetRegistry.remove('ds-5');
  });
});
