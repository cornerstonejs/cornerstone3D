import { MetadataModules } from '../enums';
import { addProvider, getTyped, metadataModuleProvider } from '../metaData';
import { clearCacheData } from '../utilities/metadataProvider/cacheData';
import { registerDisplaySetProviders } from './displaySetProvider';
import { displaySetStore } from './displaySetStore';
import type { IDisplaySet } from './IDisplaySet';

const makeDisplaySet = (displaySetId: string) =>
  ({ displaySetId }) as unknown as IDisplaySet;

describe('displaySetStore', () => {
  beforeAll(() => {
    addProvider(metadataModuleProvider, -1000);
    registerDisplaySetProviders();
  });
  beforeEach(() => displaySetStore.getState().clear());

  it('replaces by uid, keeps insertion order, and removes', () => {
    const { setDisplaySet, removeDisplaySet } = displaySetStore.getState();
    const replacement = makeDisplaySet('a2');
    setDisplaySet('a', makeDisplaySet('a1'));
    setDisplaySet('b', makeDisplaySet('b1'));
    setDisplaySet('a', replacement);

    const { displaySets } = displaySetStore.getState();
    expect([...displaySets.keys()]).toEqual(['a', 'b']);
    expect(displaySets.get('a')).toBe(replacement);
    expect(removeDisplaySet('a')).toBe(true);
    expect(removeDisplaySet('a')).toBe(false);
  });

  it('notifies subscribers with a new Map on each write', () => {
    const listener = jest.fn();
    const unsubscribe = displaySetStore.subscribe(listener);
    const before = displaySetStore.getState().displaySets;
    displaySetStore.getState().setDisplaySet('a', makeDisplaySet('a'));
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(displaySetStore.getState().displaySets).not.toBe(before);
  });

  it('getTyped(DISPLAY_SET, uid) reads the store, and clearCacheData does not clear it', () => {
    const displaySet = makeDisplaySet('a');
    displaySetStore.getState().setDisplaySet('a', displaySet);
    clearCacheData();

    expect(getTyped(MetadataModules.DISPLAY_SET, 'a')).toBe(displaySet);
    displaySetStore.getState().clear();
    expect(getTyped(MetadataModules.DISPLAY_SET, 'a')).toBeUndefined();
  });
});
