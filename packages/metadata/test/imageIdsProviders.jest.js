import { beforeEach, describe, expect, it } from '@jest/globals';
import { getTyped, removeAllProviders } from '../src/metaData';
import { registerDefaultProviders } from '../src/registerDefaultProviders';
import {
  clearCacheData,
  setCacheData,
} from '../src/utilities/metadataProvider/cacheData';
import { MetadataModules } from '../src/enums';

describe('imageIdsProviders', () => {
  beforeEach(() => {
    removeAllProviders();
    clearCacheData();
    registerDefaultProviders();
  });

  it('converts frame image ids to base image id for both path and query forms', () => {
    const baseImageId =
      'wadors:https://example.com/studies/1/series/2/instances/3';
    const pathFrameImageId = `${baseImageId}/frames/2`;
    const queryFrameImageId = `${baseImageId}?frame=2`;
    const queryFrameWithExistingParams = `${baseImageId}?foo=bar&frame=2`;

    expect(getTyped(MetadataModules.BASE_IMAGE_ID, pathFrameImageId)).toBe(
      baseImageId
    );
    expect(getTyped(MetadataModules.BASE_IMAGE_ID, queryFrameImageId)).toBe(
      baseImageId
    );
    expect(
      getTyped(MetadataModules.BASE_IMAGE_ID, queryFrameWithExistingParams)
    ).toBe(`${baseImageId}?foo=bar`);
  });

  it('generates path frame image ids from dicomweb base image id', () => {
    const baseImageId =
      'wadors:https://example.com/studies/1/series/2/instances/3';
    setCacheData('naturalized', baseImageId, {
      PhotometricInterpretation: 'MONOCHROME2',
      NumberOfFrames: 2,
    });

    const frameImageIds = getTyped(
      MetadataModules.FRAME_IMAGE_IDS,
      baseImageId
    );

    expect(frameImageIds).toEqual(
      new Set([`${baseImageId}/frames/1`, `${baseImageId}/frames/2`])
    );
  });

  it('generates query-parameter frame image ids for non-dicomweb base image id', () => {
    const baseImageId = 'wadouri:https://example.com/image.dcm';
    setCacheData('naturalized', baseImageId, {
      PhotometricInterpretation: 'MONOCHROME2',
      NumberOfFrames: 2,
    });

    expect(getTyped(MetadataModules.FRAME_IMAGE_IDS, baseImageId)).toEqual(
      new Set([`${baseImageId}?frame=1`, `${baseImageId}?frame=2`])
    );
  });
});
