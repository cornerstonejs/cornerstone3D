import { defaultMetadataContext } from './displaySetContext';
import type { DisplaySetContext } from './displaySetContext';
import { isImageInstance } from './isImageInstance';
import { isVideoInstance } from './isVideoInstance';
import {
  getContextValue,
  getMetadataContext,
  setMetadataContext,
} from './metadataContext';
import { imageSopClassUids } from './sopClassUidLists';

const NEW_UID = '1.2.3.4';
const CT = '1.2.840.10008.5.1.4.1.1.2';
const extended: DisplaySetContext = {
  ...defaultMetadataContext,
  imageSopClassUids: [...imageSopClassUids, NEW_UID],
};

describe('the active metadata context', () => {
  afterEach(() => setMetadataContext(undefined));

  const CASES: [
    string,
    () => void,
    DisplaySetContext | undefined,
    boolean,
    boolean,
  ][] = [
    // [name, setup, context argument, CT is image, NEW_UID is image]
    ['the default context', () => undefined, undefined, true, false],
    [
      'an active context with one more UID',
      () => setMetadataContext(extended),
      undefined,
      true,
      true,
    ],
    ['an explicit context argument', () => undefined, extended, true, true],
    [
      'the default again after setMetadataContext(undefined)',
      () => {
        setMetadataContext(extended);
        setMetadataContext(undefined);
      },
      undefined,
      true,
      false,
    ],
  ];

  for (const [name, setup, context, ct, added] of CASES) {
    it(`gives isImageInstance the lists of ${name}`, () => {
      setup();
      expect([
        isImageInstance({ SOPClassUID: CT }, context),
        isImageInstance({ SOPClassUID: NEW_UID }, context),
      ]).toEqual([ct, added]);
    });
  }

  it('returns the default context, and the context that a host sets', () => {
    expect(getMetadataContext()).toBe(defaultMetadataContext);
    setMetadataContext(extended);
    expect(getMetadataContext()).toBe(extended);
  });

  it('applies a customized isVideo expression to isVideoInstance', () => {
    const subject = { SOPClassUID: CT, Modality: 'XC' };
    expect(isVideoInstance(subject)).toBe(false);
    setMetadataContext({
      ...defaultMetadataContext,
      isVideo: "Modality == 'XC'",
    });
    expect(isVideoInstance(subject)).toBe(true);
  });

  it('reads any instance-scope name, and rejects a series-scope name', () => {
    expect(getContextValue('isMultiFrame', { NumberOfFrames: 3 })).toBe(true);
    expect(() => getContextValue('seriesInstanceCount', {})).toThrow(
      /series scope/
    );
  });
});
