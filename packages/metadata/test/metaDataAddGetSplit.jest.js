import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import * as metaData from '../src/metaData';
import {
  addCacheForType,
  addWritableCacheForType,
} from '../src/utilities/metadataProvider/cacheData';

const TEST_TYPE = 'testAddGetType';

describe('metaData add/get split', () => {
  beforeEach(() => {
    metaData.removeAllProviders();
    metaData.addProvider(metaData.metadataModuleProvider, -1000);
  });

  afterEach(() => {
    metaData.removeAllProviders();
    jest.restoreAllMocks();
  });

  it('keeps get-path independent from add-path providers', () => {
    const addProvider = jest.fn(() => ({ value: 'from-add' }));
    metaData.addAddProvider(TEST_TYPE, addProvider, { priority: 100 });

    expect(metaData.get(TEST_TYPE, 'image-1')).toBeUndefined();
    expect(metaData.addMetaData(TEST_TYPE, 'image-1')).toEqual({
      value: 'from-add',
    });
    expect(addProvider).toHaveBeenCalledTimes(1);
  });

  it('supports addTyped for sync and async providers', async () => {
    const syncType = 'syncTypedType';
    const asyncType = 'asyncTypedType';

    metaData.addAddProvider(syncType, () => ({ mode: 'sync' }), {
      priority: 100,
    });
    metaData.addAddProvider(asyncType, async () => ({ mode: 'async' }), {
      priority: 100,
    });

    expect(metaData.addTyped(syncType, 'image-2')).toEqual({ mode: 'sync' });
    await expect(metaData.addTyped(asyncType, 'image-3')).resolves.toEqual({
      mode: 'async',
    });
  });

  it('returns cached value and warns on duplicate writable add', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const downstream = jest.fn(async () => ({ value: 7 }));

    addCacheForType(TEST_TYPE);
    addWritableCacheForType(TEST_TYPE);
    metaData.addAddProvider(TEST_TYPE, downstream, { priority: 10 });

    await expect(metaData.addMetaData(TEST_TYPE, 'image-4')).resolves.toEqual({
      value: 7,
    });
    expect(metaData.addMetaData(TEST_TYPE, 'image-4')).toEqual({ value: 7 });

    expect(downstream).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('clearQuery invalidates in-flight add promise reuse', async () => {
    let resolvePromise;
    const inflightPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    const downstream = jest.fn(() => inflightPromise);

    addCacheForType(TEST_TYPE);
    addWritableCacheForType(TEST_TYPE);
    metaData.addAddProvider(TEST_TYPE, downstream, { priority: 10 });

    const firstCall = metaData.addMetaData(TEST_TYPE, 'image-5');
    const secondCall = metaData.addMetaData(TEST_TYPE, 'image-5');
    expect(firstCall).toBe(secondCall);
    expect(downstream).toHaveBeenCalledTimes(1);

    metaData.clearQuery(TEST_TYPE, 'image-5');
    const thirdCall = metaData.addMetaData(TEST_TYPE, 'image-5');
    expect(downstream).toHaveBeenCalledTimes(2);
    expect(thirdCall).not.toBe(firstCall);

    resolvePromise({ value: 99 });
    await expect(firstCall).resolves.toEqual({ value: 99 });
    await expect(thirdCall).resolves.toEqual({ value: 99 });
  });
});
