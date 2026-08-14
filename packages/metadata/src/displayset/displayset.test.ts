import { describe, expect, it } from '@jest/globals';
import { buildSeriesInfo } from './buildSeriesInfo';
import { createDisplaySetFromGroup } from './createDisplaySetFromGroup';
import { defaultDisplaySetSplitRules } from './defaultDisplaySetSplitRules';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import { ImageStackDisplaySet } from './ImageStackDisplaySet';
import { isVideoInstance } from './isVideoInstance';
import { resolveInstances } from './resolveInstances';
import { splitImageIdsBySplitRules } from './splitImageIdsBySplitRules';
import type { InstanceGroup, NaturalizedInstance, SplitRule } from './types';
import { getPreferredViewportType } from './viewportTypes';

describe('displayset split utilities', () => {
  const instances: NaturalizedInstance[] = [
    {
      imageId: 'wadors:1',
      Modality: 'CT',
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
      Rows: 512,
      Columns: 512,
      SeriesInstanceUID: '1.2.3',
      InstanceNumber: 1,
    },
    {
      imageId: 'wadors:2',
      Modality: 'CT',
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
      Rows: 512,
      Columns: 512,
      SeriesInstanceUID: '1.2.3',
      InstanceNumber: 2,
    },
  ];

  const getNaturalizedInstance = (imageId: string) =>
    instances.find((instance) => instance.imageId === imageId);

  it('resolveInstances preserves order and skips missing ids', () => {
    const resolved = resolveInstances(
      ['wadors:2', 'wadors:missing', 'wadors:1'],
      getNaturalizedInstance
    );
    expect(resolved.map((i) => i.imageId)).toEqual(['wadors:2', 'wadors:1']);
  });

  it('default rules group multi-slice CT as volume (MPR) preferred', () => {
    const groups = splitImageIdsBySplitRules(
      instances.map((i) => i.imageId!),
      {
        getNaturalizedInstance: (id) => instances.find((i) => i.imageId === id),
        splitRules: defaultDisplaySetSplitRules,
      }
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].matchedRule.id).toBe('volume3d');
    const displaySet = createDisplaySetFromGroup(groups[0]);
    // The volume3d rule defaults volumetric series to MPR (volume); volume3d
    // remains an allowed-but-not-preferred viewport type.
    expect(displaySet.viewportTypes[0]).toBe('volume');
    expect(displaySet.viewportTypes).toContain('volume3d');
    expect(displaySet.preferredViewportType).toBe('volume');
  });

  it('video rule uses video viewportTypes', () => {
    const videoInstance: NaturalizedInstance = {
      imageId: 'wadors:video',
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.77.1.4.1',
      Modality: 'US',
    };
    const groups = splitImageIdsBySplitRules(['wadors:video'], {
      getNaturalizedInstance: () => videoInstance,
      splitRules: defaultDisplaySetSplitRules,
    });
    expect(groups[0].matchedRule.id).toBe('video');
    const displaySet = createDisplaySetFromGroup(groups[0]);
    expect(displaySet.viewportTypes).toEqual(['video']);
    expect(getPreferredViewportType(displaySet.viewportTypes)).toBe('video');
    // The video display set exposes its instances so consumers (e.g. the video
    // viewport's setDisplaySets) can resolve the source imageId directly.
    expect(displaySet.instances[0]?.imageId).toBe('wadors:video');
  });

  it('ecg rule uses ecg viewportTypes', () => {
    const ecgInstance: NaturalizedInstance = {
      imageId: 'wadors:ecg',
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.9.1.1',
      Modality: 'ECG',
    };
    const groups = splitImageIdsBySplitRules(['wadors:ecg'], {
      getNaturalizedInstance: () => ecgInstance,
      splitRules: defaultDisplaySetSplitRules,
    });
    expect(groups[0].matchedRule.id).toBe('ecg');
    expect(createDisplaySetFromGroup(groups[0]).viewportTypes[0]).toBe('ecg');
  });

  it('splits MR mixed B-value series', () => {
    const mrInstances: NaturalizedInstance[] = [
      {
        imageId: 'wadors:a',
        Modality: 'MR',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
        Rows: 256,
        SeriesInstanceUID: 'series-mr',
        DiffusionBValue: 800,
      },
      {
        imageId: 'wadors:b',
        Modality: 'MR',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
        Rows: 256,
        SeriesInstanceUID: 'series-mr',
      },
    ];
    const groups = splitImageIdsBySplitRules(
      mrInstances.map((i) => i.imageId!),
      {
        getNaturalizedInstance: (id) =>
          mrInstances.find((i) => i.imageId === id),
        splitRules: defaultDisplaySetSplitRules,
      }
    );
    expect(groups).toHaveLength(2);
  });

  it('ImageStackDisplaySet exposes underlying and frame ids', () => {
    const displaySet = ImageStackDisplaySet.fromInstances(instances, {
      displaySetId: 'uid-1',
      viewportTypes: ['stack', 'volume', 'volume3d'],
    });
    expect(displaySet.underlyingImageIds.length).toBe(2);
    expect(displaySet.viewportTypes[0]).toBe('stack');
    expect(displaySet.preferredViewportType).toBe('stack');
  });

  it('groups by default image rule into a single group', () => {
    const singleInstance = [instances[0]];
    const rules: SplitRule[] = [
      {
        id: 'defaultImageRule',
        viewportTypes: ['stack'],
        matches: (instance) =>
          instance.SOPClassUID === '1.2.840.10008.5.1.4.1.1.2' &&
          !!instance.Rows,
      },
    ];
    const groups = groupInstancesBySplitRules(singleInstance, rules);
    expect(groups).toHaveLength(1);
    expect(groups[0].instances).toHaveLength(1);
  });

  it('spreads matched-rule customAttributes flat onto the display set', () => {
    const multiFrameInstances: NaturalizedInstance[] = [
      {
        imageId: 'wadors:mf',
        Modality: 'XA',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.12.1',
        Rows: 512,
        NumberOfFrames: 30,
        SliceLocation: 0,
        SeriesInstanceUID: 'series-mf',
        InstanceNumber: 1,
      },
    ];
    const groups = splitImageIdsBySplitRules(['wadors:mf'], {
      getNaturalizedInstance: () => multiFrameInstances[0],
      splitRules: defaultDisplaySetSplitRules,
    });
    expect(groups[0].matchedRule.id).toBe('multiFrame');

    const displaySet = createDisplaySetFromGroup(groups[0], { splitNumber: 2 });
    // customAttributes for the multiFrame rule are spread flat onto the display
    // set; the keys are type-declared via the IDisplaySet extension.
    expect(displaySet.isClip).toBe(true);
    expect(displaySet.numImageFrames).toBe(30);
    expect(displaySet.splitNumber).toBe(2);
    expect(displaySet.viewportTypes).toEqual(['stack']);
  });

  it('coerces a string NumberOfFrames to a numeric numImageFrames', () => {
    const multiFrameInstances: NaturalizedInstance[] = [
      {
        imageId: 'wadors:mf-str',
        Modality: 'XA',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.12.1',
        Rows: 512,
        // Naturalized DICOM frequently yields NumberOfFrames as a string.
        NumberOfFrames: '30' as unknown as number,
        SliceLocation: 0,
        SeriesInstanceUID: 'series-mf-str',
        InstanceNumber: 1,
      },
    ];
    const groups = splitImageIdsBySplitRules(['wadors:mf-str'], {
      getNaturalizedInstance: () => multiFrameInstances[0],
      splitRules: defaultDisplaySetSplitRules,
    });
    expect(groups[0].matchedRule.id).toBe('multiFrame');

    const displaySet = createDisplaySetFromGroup(groups[0]);
    expect(displaySet.numImageFrames).toBe(30);
    expect(typeof displaySet.numImageFrames).toBe('number');
  });

  it('classifies an MPEG2 transfer syntax instance as video', () => {
    // MPEG2 Main Profile @ Main Level - in the shared videoUIDs list but absent
    // from the previously hard-coded subset, so this guards against regressing
    // back to a second drifting list.
    const mpeg2Instance: NaturalizedInstance = {
      imageId: 'wadors:mpeg2',
      // A non-video image SOP class so only the transfer syntax can match.
      SOPClassUID: '1.2.840.10008.5.1.4.1.1.7',
      TransferSyntaxUID: '1.2.840.10008.1.2.4.100',
      Modality: 'OT',
    };
    expect(isVideoInstance(mpeg2Instance)).toBe(true);
  });

  it('buildSeriesInfo and grouping are safe on an empty instance list', () => {
    // buildSeriesInfo only aggregates counts; grouping derives each rule's
    // `series` facts up front. Both must be safe when given no instances.
    expect(() => buildSeriesInfo([])).not.toThrow();

    const seriesInfo = buildSeriesInfo([]);
    expect(seriesInfo.NumberOfSeriesRelatedInstances).toBe(0);
    expect(groupInstancesBySplitRules([], defaultDisplaySetSplitRules)).toEqual(
      []
    );
  });

  it('does not let customAttributes clobber resolved data fields', () => {
    const stackInstances: NaturalizedInstance[] = [
      {
        imageId: 'wadors:reserved',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
        Rows: 512,
        SeriesInstanceUID: 'series-reserved',
        InstanceNumber: 1,
      },
    ];
    const group: InstanceGroup = {
      instances: stackInstances,
      matchedRule: {
        id: 'reserved-clobber',
        viewportTypes: ['stack'],
        customAttributes: () => ({
          // Reserved data fields must be ignored ...
          imageIds: ['evil-frame'],
          underlyingImageIds: ['evil-underlying'],
          instances: [],
          displaySetId: 'evil-uid',
          // ... while non-reserved custom attributes are still applied.
          customFlag: true,
        }),
      },
    };

    const displaySet = createDisplaySetFromGroup(group, {
      displaySetId: 'good-uid',
    });

    expect(displaySet.imageIds).toEqual(['wadors:reserved']);
    expect(displaySet.underlyingImageIds).toEqual(['wadors:reserved']);
    expect(displaySet.instances).toHaveLength(1);
    expect(displaySet.displaySetId).toBe('good-uid');
    expect((displaySet as unknown as Record<string, unknown>).customFlag).toBe(
      true
    );
  });

  it('derives unique displaySetIds for splits of one series', () => {
    const seriesUID = 'series-split';
    const makeGroup = (imageId: string): InstanceGroup => ({
      instances: [
        {
          imageId,
          SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
          Rows: 256,
          SeriesInstanceUID: seriesUID,
        },
      ],
      matchedRule: { id: 'split', viewportTypes: ['stack'] },
    });

    // A series can split into multiple display sets (the DWI case); the split
    // index keeps their displaySetIds - used as the viewport id - unique
    // instead of all collapsing to the bare SeriesInstanceUID.
    const ds0 = createDisplaySetFromGroup(makeGroup('wadors:s0'), {
      splitNumber: 0,
    });
    const ds1 = createDisplaySetFromGroup(makeGroup('wadors:s1'), {
      splitNumber: 1,
    });

    expect(ds0.displaySetId).toBe(seriesUID);
    expect(ds1.displaySetId).toBe(`${seriesUID}:1`);
    expect(ds0.displaySetId).not.toBe(ds1.displaySetId);
  });

  it('namespaces buckets by rule so identical split keys do not merge', () => {
    const insts: NaturalizedInstance[] = [
      { imageId: 'a', Modality: 'XA' },
      { imageId: 'b', Modality: 'NM' },
    ];
    // Two different rules whose groupBy functions return the same string.
    const rules: SplitRule[] = [
      {
        id: 'ruleA',
        matches: (i) => i.Modality === 'XA',
        groupBy: [() => 'same'],
      },
      {
        id: 'ruleB',
        matches: (i) => i.Modality === 'NM',
        groupBy: [() => 'same'],
      },
    ];
    const groups = groupInstancesBySplitRules(insts, rules);

    // Without rule-namespaced keys these would collapse into one bucket.
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.matchedRule.id))).toEqual(
      new Set(['ruleA', 'ruleB'])
    );
  });

  it('returns groups in a deterministic order regardless of input order', () => {
    const mr: NaturalizedInstance[] = [
      {
        imageId: 'a',
        Modality: 'MR',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
        Rows: 256,
        SeriesInstanceUID: 's',
        DiffusionBValue: 800,
      },
      {
        imageId: 'b',
        Modality: 'MR',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
        Rows: 256,
        SeriesInstanceUID: 's',
      },
    ];
    const options = {
      getNaturalizedInstance: (id: string) => mr.find((i) => i.imageId === id),
      splitRules: defaultDisplaySetSplitRules,
    };

    const forward = splitImageIdsBySplitRules(['a', 'b'], options);
    const reverse = splitImageIdsBySplitRules(['b', 'a'], options);

    expect(forward.map((g) => g.splitKey)).toEqual(
      reverse.map((g) => g.splitKey)
    );
  });

  it('series hook splits a mixed-b-value DWI series into two display sets', () => {
    const mixed: NaturalizedInstance[] = [
      {
        imageId: 'b800',
        Modality: 'MR',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
        Rows: 256,
        SeriesInstanceUID: 'dwi',
        DiffusionBValue: 800,
      },
      {
        imageId: 'noB',
        Modality: 'MR',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
        Rows: 256,
        SeriesInstanceUID: 'dwi',
      },
    ];
    const groups = splitImageIdsBySplitRules(['b800', 'noB'], {
      getNaturalizedInstance: (id) => mixed.find((i) => i.imageId === id),
      splitRules: defaultDisplaySetSplitRules,
    });

    expect(groups).toHaveLength(2);
    expect(
      groups.every((g) => g.matchedRule.id === 'mixedDimensionalityBValue')
    ).toBe(true);
  });

  it('series hook leaves a non-mixed DWI series as one volume display set', () => {
    // Every frame has a b-value, so the mixed-b-value rule must not fire; the
    // series falls through to the volume3d rule as a single display set.
    const allBValue: NaturalizedInstance[] = [
      {
        imageId: 'b0',
        Modality: 'MR',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
        Rows: 256,
        SeriesInstanceUID: 'dwi-uniform',
        DiffusionBValue: 0,
      },
      {
        imageId: 'b1000',
        Modality: 'MR',
        SOPClassUID: '1.2.840.10008.5.1.4.1.1.4',
        Rows: 256,
        SeriesInstanceUID: 'dwi-uniform',
        DiffusionBValue: 1000,
      },
    ];
    const groups = splitImageIdsBySplitRules(['b0', 'b1000'], {
      getNaturalizedInstance: (id) => allBValue.find((i) => i.imageId === id),
      splitRules: defaultDisplaySetSplitRules,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].matchedRule.id).toBe('volume3d');
  });

  it('reports instances that match no rule via onUnmatched', () => {
    const insts: NaturalizedInstance[] = [
      { imageId: 'a', Modality: 'CT' },
      { imageId: 'b', Modality: 'SR' },
    ];
    const rules: SplitRule[] = [
      {
        id: 'ct',
        matches: (i) => i.Modality === 'CT',
        groupBy: ['imageId'],
      },
    ];
    const unmatched: string[] = [];

    const groups = groupInstancesBySplitRules(insts, rules, (i) =>
      unmatched.push(i.imageId!)
    );

    expect(unmatched).toEqual(['b']);
    expect(groups).toHaveLength(1);
  });
});

describe('split key stability', () => {
  const ct = (
    imageId: string,
    InstanceNumber: number
  ): NaturalizedInstance => ({
    imageId,
    Modality: 'CT',
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.2',
    Rows: 512,
    SeriesInstanceUID: 'series-1',
    SOPInstanceUID: `sop-${imageId}`,
    InstanceNumber,
  });

  const ctRule: SplitRule = {
    id: 'ct',
    matches: (i) => i.Modality === 'CT',
    groupBy: ['SeriesInstanceUID', 'InstanceNumber'],
  };

  it('keys off the rule id, so inserting a rule leaves other rules keys unchanged', () => {
    // The point of the whole id-based discriminator: a caller that persisted
    // something against a display set must still find it after the rule set is
    // edited. Keying off the rule's array position would move every key below
    // an insertion.
    const instances = [ct('a', 1), ct('b', 2)];

    const before = groupInstancesBySplitRules(instances, [ctRule]);
    const after = groupInstancesBySplitRules(instances, [
      { id: 'inserted-ahead', matches: (i) => i.Modality === 'XA' },
      ctRule,
    ]);

    expect(after.map((g) => g.splitKey)).toEqual(before.map((g) => g.splitKey));
  });

  it('rejects a rule set with duplicate ids', () => {
    expect(() =>
      groupInstancesBySplitRules(
        [ct('a', 1)],
        [
          { id: 'same', matches: (i) => i.Modality === 'MR' },
          { id: 'same', matches: (i) => i.Modality === 'CT' },
        ]
      )
    ).toThrow(/Duplicate split rule id "same" at index 1/);
  });

  it('falls back to position for rules with no id', () => {
    const groups = groupInstancesBySplitRules(
      [ct('a', 1)],
      [{ matches: (i) => i.Modality === 'CT', groupBy: ['imageId'] }]
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].splitKey).toBe(JSON.stringify(['#0', 'a']));
  });

  it('orders groups by rule position, then by key numerically', () => {
    // '10' must sort after '2', not lexically before it.
    const instances = [ct('j', 10), ct('b', 2), ct('a', 1)];

    const groups = groupInstancesBySplitRules(instances, [ctRule]);

    expect(groups.map((g) => g.instances[0].imageId)).toEqual(['a', 'b', 'j']);
  });

  it('produces the same keys regardless of input order', () => {
    const forward = groupInstancesBySplitRules(
      [ct('a', 1), ct('b', 2), ct('j', 10)],
      [ctRule]
    );
    const shuffled = groupInstancesBySplitRules(
      [ct('j', 10), ct('a', 1), ct('b', 2)],
      [ctRule]
    );

    expect(shuffled.map((g) => g.splitKey)).toEqual(
      forward.map((g) => g.splitKey)
    );
  });
});

describe('runBy - interleaved single-frame and multi-frame instances', () => {
  // The ultrasound case: a series alternating single images and multi-frame
  // clips. `img1 img2 img3 clip4 img5 clip6` must become four display sets -
  // the three leading singles together, then each clip and the later single on
  // their own. Grouping on a per-instance discriminator merges img1..3 with
  // img5; grouping on InstanceNumber over-splits img1..3 into three.
  const us = (
    imageId: string,
    InstanceNumber: number,
    NumberOfFrames?: number
  ): NaturalizedInstance => ({
    imageId,
    Modality: 'US',
    SOPClassUID: '1.2.840.10008.5.1.4.1.1.6.1',
    Rows: 480,
    Columns: 640,
    SeriesInstanceUID: 'us-series',
    SOPInstanceUID: `sop-${imageId}`,
    InstanceNumber,
    ...(NumberOfFrames === undefined ? {} : { NumberOfFrames }),
  });

  const interleaved = [
    us('img1', 1),
    us('img2', 2),
    us('img3', 3),
    us('clip4', 4, 60),
    us('img5', 5),
    us('clip6', 6, 45),
  ];

  const usRunRule: SplitRule = {
    id: 'usInterleaved',
    matches: (i) => i.Modality === 'US',
    runBy: (i) => Number(i.NumberOfFrames ?? 1) > 1,
  };

  it('splits interleaved singles and clips into one display set per run', () => {
    const groups = groupInstancesBySplitRules(interleaved, [usRunRule]);

    expect(groups.map((g) => g.instances.map((i) => i.imageId))).toEqual([
      ['img1', 'img2', 'img3'],
      ['clip4'],
      ['img5'],
      ['clip6'],
    ]);
  });

  it('merges the singles into one set when runBy is omitted', () => {
    // Guards the claim above: without runBy the same rule produces the wrong
    // answer, so the test proves runBy is what does the work.
    const groups = groupInstancesBySplitRules(interleaved, [
      { id: 'usInterleaved', matches: (i) => i.Modality === 'US' },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].instances).toHaveLength(6);
  });

  it('numbers runs by acquisition order, not input order', () => {
    const shuffled = [
      interleaved[4],
      interleaved[0],
      interleaved[5],
      interleaved[2],
      interleaved[3],
      interleaved[1],
    ];

    const groups = groupInstancesBySplitRules(shuffled, [usRunRule]);

    expect(groups.map((g) => g.instances.map((i) => i.imageId).sort())).toEqual(
      [['img1', 'img2', 'img3'], ['clip4'], ['img5'], ['clip6']]
    );
  });

  it('computes runs over the instances the rule claimed, ignoring others', () => {
    // The XA instance sits between img3 and img5 in acquisition order but is
    // claimed by an earlier rule, so it must not break the US run numbering.
    const withOther: NaturalizedInstance[] = [
      ...interleaved.slice(0, 3),
      {
        imageId: 'xa',
        Modality: 'XA',
        SeriesInstanceUID: 'us-series',
        SOPInstanceUID: 'sop-xa',
        InstanceNumber: 3.5,
      },
      ...interleaved.slice(3),
    ];

    const groups = groupInstancesBySplitRules(withOther, [
      { id: 'xa', matches: (i) => i.Modality === 'XA' },
      usRunRule,
    ]);

    expect(
      groups
        .filter((g) => g.matchedRule.id === 'usInterleaved')
        .map((g) => g.instances.map((i) => i.imageId))
    ).toEqual([['img1', 'img2', 'img3'], ['clip4'], ['img5'], ['clip6']]);
  });

  it('combines runBy with groupBy', () => {
    // Two runs of singles that also differ in size must not merge just because
    // they share a run ordinal position in their own group.
    const groups = groupInstancesBySplitRules(interleaved, [
      {
        id: 'usSized',
        matches: (i) => i.Modality === 'US',
        groupBy: ['Rows'],
        runBy: (i) => Number(i.NumberOfFrames ?? 1) > 1,
      },
    ]);

    expect(groups).toHaveLength(4);
  });

  it('does not start a new run for structurally equal object values', () => {
    // A fresh array per instance would be reference-unequal every time and
    // split every instance into its own run.
    const instances = [
      { ...us('a', 1), ImageType: ['ORIGINAL', 'PRIMARY'] },
      { ...us('b', 2), ImageType: ['ORIGINAL', 'PRIMARY'] },
      { ...us('c', 3), ImageType: ['DERIVED', 'SECONDARY'] },
    ];

    const groups = groupInstancesBySplitRules(instances, [
      {
        id: 'byImageType',
        matches: () => true,
        runBy: (i) => i.ImageType,
      },
    ]);

    expect(groups.map((g) => g.instances.map((i) => i.imageId))).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
  });
});
