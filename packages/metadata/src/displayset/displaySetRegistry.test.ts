import { MetadataModules } from '../enums';
import {
  clearCacheData,
  getCacheData,
  setCacheData,
} from '../utilities/metadataProvider/cacheData';
import { displaySetRegistry } from './displaySetRegistry';
import type { IDisplaySet } from './IDisplaySet';
import { registerDisplaySetMetadata } from './registerDisplaySetMetadata';

const DISPLAY_SET = MetadataModules.DISPLAY_SET;

/** What the registry holds under the id, as an object to compare. */
function registered(displaySetId: string) {
  return displaySetRegistry.get(displaySetId) as object | undefined;
}

function createDisplaySet(
  displaySetId: string,
  underlyingImageIds: string[] = []
): IDisplaySet {
  return {
    displaySetId,
    isDisplayable: true,
    instances: [],
    imageIds: [`${displaySetId}:frame`],
    underlyingImageIds,
  };
}

describe('displaySetRegistry', () => {
  afterEach(() => {
    displaySetRegistry.clear();
    clearCacheData();
  });

  describe('a write', () => {
    it('keeps the object itself in MetadataModules.DISPLAY_SET', () => {
      const descriptor = { imageIds: ['image:1'] };

      displaySetRegistry.add('ds', descriptor);

      expect(displaySetRegistry.get('ds')).toBe(descriptor);
      expect(getCacheData(DISPLAY_SET, 'ds')).toBe(descriptor);
    });

    it('replaces what an earlier add under the same id wrote', () => {
      const first = { imageIds: ['image:1'] };
      const second = { imageIds: ['image:2'] };

      displaySetRegistry.add('ds', first);
      displaySetRegistry.add('ds', second);

      expect(registered('ds')).toBe(second);
      expect(getCacheData(DISPLAY_SET, 'ds')).toBe(second);
    });

    it('does not copy or change an application display set, and shows the changes the application makes to it', () => {
      const ohifDisplaySet = {
        displaySetInstanceUID: 'uid-1',
        imageIds: ['image:1'],
      };

      displaySetRegistry.add('uid-1', ohifDisplaySet);
      ohifDisplaySet.imageIds = ['image:1', 'image:2'];

      expect(Object.keys(ohifDisplaySet)).toEqual([
        'displaySetInstanceUID',
        'imageIds',
      ]);
      expect(displaySetRegistry.get('uid-1').imageIds).toEqual([
        'image:1',
        'image:2',
      ]);
    });

    it('throws when the descriptor has a displaySetId that is not the id, and stores nothing', () => {
      expect(() =>
        displaySetRegistry.add('ds-a', { displaySetId: 'ds-b', imageIds: [] })
      ).toThrow(
        'displaySetRegistry.add: the descriptor has the displaySetId "ds-b", ' +
          'which is not the id "ds-a" that it is added under'
      );
      expect(displaySetRegistry.has('ds-a')).toBe(false);
      expect(getCacheData(DISPLAY_SET, 'ds-a')).toBeUndefined();
    });

    it('takes a descriptor whose displaySetId is the id', () => {
      const descriptor = { displaySetId: 'ds-a', imageIds: ['image:1'] };

      displaySetRegistry.add('ds-a', descriptor);

      expect(displaySetRegistry.get('ds-a')).toBe(descriptor);
    });

    it('refuses an empty id', () => {
      expect(() => displaySetRegistry.add('', { imageIds: [] })).toThrow(
        'A display set is registered under a non-empty id'
      );
    });

    it('is not made by a value that was written to the module without the registry', () => {
      setCacheData(DISPLAY_SET, 'uid-2', {
        displaySetInstanceUID: 'uid-2',
        imageIds: ['image:1'],
      });

      expect(displaySetRegistry.has('uid-2')).toBe(false);
      expect(displaySetRegistry.get('uid-2')).toBeUndefined();
    });
  });

  describe('display set ids and image id aliases', () => {
    it('does not answer get or has for an image id that registerDisplaySetMetadata stored the display set under', () => {
      const displaySet = createDisplaySet('ds', ['instance:1']);

      registerDisplaySetMetadata(['series:1'], displaySet);

      expect(registered('ds')).toBe(displaySet);
      expect(getCacheData(DISPLAY_SET, 'series:1')).toBe(displaySet);
      expect(getCacheData(DISPLAY_SET, 'instance:1')).toBe(displaySet);
      expect(displaySetRegistry.get('series:1')).toBeUndefined();
      expect(displaySetRegistry.has('series:1')).toBe(false);
      expect(displaySetRegistry.has('instance:1')).toBe(false);
    });

    it('stores the frame image ids too with includeImageIds', () => {
      const displaySet = createDisplaySet('ds');

      registerDisplaySetMetadata([], displaySet, { includeImageIds: true });

      expect(getCacheData(DISPLAY_SET, 'ds:frame')).toBe(displaySet);
      expect(displaySetRegistry.has('ds:frame')).toBe(false);
    });

    it('does not let an alias overwrite a display set id', () => {
      const descriptor = { imageId: 'ecg:1' };
      const displaySet = createDisplaySet('ds');

      displaySetRegistry.add('ecg:1', descriptor);
      registerDisplaySetMetadata(['ecg:1'], displaySet);

      expect(displaySetRegistry.get('ecg:1')).toBe(descriptor);

      displaySetRegistry.remove('ds');

      expect(displaySetRegistry.get('ecg:1')).toBe(descriptor);
    });

    it('lets a display set id overwrite an alias', () => {
      const displaySet = createDisplaySet('ds');
      const descriptor = { imageId: 'series:1' };

      registerDisplaySetMetadata(['series:1'], displaySet);
      displaySetRegistry.add('series:1', descriptor);

      expect(displaySetRegistry.get('series:1')).toBe(descriptor);

      displaySetRegistry.remove('ds');

      expect(displaySetRegistry.get('series:1')).toBe(descriptor);
    });
  });

  describe('removal', () => {
    it('removes the display set and the aliases that it wrote', () => {
      const displaySet = createDisplaySet('ds', ['instance:1']);

      registerDisplaySetMetadata(['series:1'], displaySet);
      displaySetRegistry.remove('ds');

      expect(displaySetRegistry.has('ds')).toBe(false);
      expect(getCacheData(DISPLAY_SET, 'ds')).toBeUndefined();
      expect(getCacheData(DISPLAY_SET, 'series:1')).toBeUndefined();
      expect(getCacheData(DISPLAY_SET, 'instance:1')).toBeUndefined();
    });

    it('removes nothing for an alias', () => {
      const displaySet = createDisplaySet('ds');

      registerDisplaySetMetadata(['series:1'], displaySet);
      displaySetRegistry.remove('series:1');

      expect(registered('ds')).toBe(displaySet);
      expect(getCacheData(DISPLAY_SET, 'series:1')).toBe(displaySet);
    });

    it('leaves an alias that another display set wrote since', () => {
      const first = createDisplaySet('ds-1');
      const second = createDisplaySet('ds-2');

      registerDisplaySetMetadata(['shared:1'], first);
      registerDisplaySetMetadata(['shared:1'], second);
      displaySetRegistry.remove('ds-1');

      expect(getCacheData(DISPLAY_SET, 'shared:1')).toBe(second);
    });

    it('clear() removes every display set and its aliases, and leaves what the registry did not write', () => {
      const written = { displaySetInstanceUID: 'uid-3' };

      setCacheData(DISPLAY_SET, 'uid-3', written);
      registerDisplaySetMetadata(['series:1'], createDisplaySet('ds-1'));
      displaySetRegistry.add('ds-2', { imageIds: ['image:2'] });
      displaySetRegistry.clear();

      expect(displaySetRegistry.has('ds-1')).toBe(false);
      expect(displaySetRegistry.has('ds-2')).toBe(false);
      expect(getCacheData(DISPLAY_SET, 'series:1')).toBeUndefined();
      expect(getCacheData(DISPLAY_SET, 'uid-3')).toBe(written);
    });

    it('forgets the display sets that clearCacheData() cleared', () => {
      displaySetRegistry.add('ds', { imageIds: ['image:1'] });
      clearCacheData();

      expect(displaySetRegistry.has('ds')).toBe(false);

      displaySetRegistry.clear();

      expect(getCacheData(DISPLAY_SET, 'ds')).toBeUndefined();
    });
  });

  describe('registering again under the same id', () => {
    it('replaces the image ids of the earlier registration', () => {
      const first = createDisplaySet('ds');
      const second = createDisplaySet('ds');

      registerDisplaySetMetadata(['image:a', 'image:b'], first);
      registerDisplaySetMetadata(['image:b', 'image:c'], second);

      expect(registered('ds')).toBe(second);
      expect(getCacheData(DISPLAY_SET, 'image:a')).toBeUndefined();
      expect(getCacheData(DISPLAY_SET, 'image:b')).toBe(second);
      expect(getCacheData(DISPLAY_SET, 'image:c')).toBe(second);

      registerDisplaySetMetadata(['image:b'], second);

      expect(getCacheData(DISPLAY_SET, 'image:b')).toBe(second);
      expect(getCacheData(DISPLAY_SET, 'image:c')).toBeUndefined();

      displaySetRegistry.remove('ds');

      expect(getCacheData(DISPLAY_SET, 'image:b')).toBeUndefined();
    });

    it('keeps the aliases when add is given the same object, and drops them for a new object', () => {
      const displaySet = createDisplaySet('ds');

      registerDisplaySetMetadata(['image:a'], displaySet);
      displaySetRegistry.add('ds', displaySetRegistry.get('ds'));

      expect(getCacheData(DISPLAY_SET, 'image:a')).toBe(displaySet);

      displaySetRegistry.add('ds', { imageIds: ['image:z'] });

      expect(getCacheData(DISPLAY_SET, 'image:a')).toBeUndefined();
    });

    it('takes an image id array that the application reuses with other ids', () => {
      const imageIds = ['image:a'];
      const displaySet = createDisplaySet('ds');

      registerDisplaySetMetadata(imageIds, displaySet);
      imageIds.splice(0, 1, 'image:b');
      registerDisplaySetMetadata(imageIds, displaySet);

      expect(getCacheData(DISPLAY_SET, 'image:a')).toBeUndefined();
      expect(getCacheData(DISPLAY_SET, 'image:b')).toBe(displaySet);
    });
  });
});
