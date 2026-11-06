import {
  metaData,
  registerDisplaySetProviders,
  registerDisplaySetMetadata,
} from '@cornerstonejs/metadata';
import {
  getGenericViewportImageDisplaySet,
  getGenericViewportPlanarDisplaySet,
  getGenericViewportSourceDataId,
  getGenericViewportWSIDisplaySet,
} from '../src/RenderingEngine/GenericViewport/genericViewportDisplaySetAccess';
import genericViewportDisplaySetMetadataProvider from '../src/utilities/genericViewportDisplaySetMetadataProvider';

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

    expect(getGenericViewportImageDisplaySet('ds-1').imageIds).toEqual([
      'ds-1:frame1',
      'ds-1:frame2',
    ]);
    expect(getGenericViewportPlanarDisplaySet('ds-1').imageIds).toHaveLength(2);
    // Video and ECG show the first instance.
    expect(getGenericViewportSourceDataId('ds-1')).toBe('ds-1:instance');
  });

  it('loads an OHIF display set, keyed by displaySetInstanceUID', () => {
    metaData.addTyped('displaySetModule', 'uid-2', {
      displaySet: {
        displaySetInstanceUID: 'uid-2',
        imageIds: ['video:1'],
      },
    });

    expect(getGenericViewportSourceDataId('uid-2')).toBe('video:1');
  });

  it('does not take a display set that the cache holds under an image id', () => {
    registerDisplaySetMetadata(['ecg:imageId'], displaySet('ds-3'));

    // The ECG example opens an instance by its image id. That id is not a
    // display set id, so the source stays the image id.
    expect(getGenericViewportSourceDataId('ecg:imageId')).toBe('ecg:imageId');
    expect(getGenericViewportImageDisplaySet('ecg:imageId')).toBeUndefined();
  });

  it('loads a WSI display set that has a web client', () => {
    const webClient = { getDICOMwebMetadata: () => undefined };
    registerDisplaySetMetadata(
      [],
      displaySet('ds-4', { handler: 'wholeSlide', options: { webClient } })
    );

    expect(getGenericViewportWSIDisplaySet('ds-4')).toEqual({
      kind: 'wsi',
      imageIds: ['ds-4:frame1', 'ds-4:frame2'],
      options: { miniNavigationOverlay: undefined, webClient },
    });
  });

  it('uses the viewport registry first', () => {
    registerDisplaySetMetadata([], displaySet('ds-5'));
    genericViewportDisplaySetMetadataProvider.add('ds-5', ['registry:1']);

    expect(getGenericViewportImageDisplaySet('ds-5').imageIds).toEqual([
      'registry:1',
    ]);
    genericViewportDisplaySetMetadataProvider.remove('ds-5');
  });
});
