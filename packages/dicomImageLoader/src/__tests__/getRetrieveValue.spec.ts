import getRetrieveValue from '../imageLoader/internal/getRetrieveValue';
import metaDataManager from '../imageLoader/wadors/metaDataManager';

describe('getRetrieveValue', () => {
  afterEach(() => {
    metaDataManager.purge();
  });

  it('returns a plain numeric option unchanged', () => {
    expect(
      getRetrieveValue<number>('wadors:x', { chunkSize: 32768 }, 'chunkSize')
    ).toBe(32768);
  });

  it('returns undefined for an option that is not set', () => {
    expect(
      getRetrieveValue<number>('wadors:x', {}, 'chunkSize')
    ).toBeUndefined();
  });

  it('tolerates missing retrieve options', () => {
    expect(
      getRetrieveValue<number>('wadors:x', undefined as never, 'chunkSize')
    ).toBeUndefined();
  });

  it('calls a callback option with the image metadata and imageId', () => {
    const imageId = 'wadors:https://example.com/frames/1';
    const metadata = { '00280010': { Value: [512] } };
    metaDataManager.add(imageId, metadata as never);

    const chunkSize = jest.fn().mockReturnValue(65536);

    expect(getRetrieveValue<number>(imageId, { chunkSize }, 'chunkSize')).toBe(
      65536
    );
    expect(chunkSize).toHaveBeenCalledWith(metadata, imageId);
  });

  it('resolves the callback to a number rather than passing the function on', () => {
    // A function left unresolved is truthy, so it would flow into the byte
    // arithmetic and disable the threshold that depends on it.
    const resolved = getRetrieveValue<number>(
      'wadors:x',
      { chunkSize: () => 128 * 1024 },
      'chunkSize'
    );

    expect(typeof resolved).toBe('number');
    expect(resolved).toBe(131072);
  });
});
