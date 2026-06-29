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
        ruleSelector: (instance) =>
          instance.SOPClassUID === '1.2.840.10008.5.1.4.1.1.2' &&
          !!instance.Rows,
      },
    ];
    const seriesInfo = buildSeriesInfo(singleInstance, rules);
    const groups = groupInstancesBySplitRules(
      singleInstance,
      rules,
      seriesInfo
    );
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
    // buildSeriesInfo runs every rule's updateSeriesInfo, several of which read
    // instances[0]; it must not throw when called with no instances.
    expect(() =>
      buildSeriesInfo([], defaultDisplaySetSplitRules)
    ).not.toThrow();

    const seriesInfo = buildSeriesInfo([], defaultDisplaySetSplitRules);
    expect(seriesInfo.NumberOfSeriesRelatedInstances).toBe(0);
    expect(
      groupInstancesBySplitRules([], defaultDisplaySetSplitRules, seriesInfo)
    ).toEqual([]);
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
    // Two different rules whose splitKey functions return the same string.
    const rules: SplitRule[] = [
      {
        id: 'ruleA',
        ruleSelector: (i) => i.Modality === 'XA',
        splitKey: [() => 'same'],
      },
      {
        id: 'ruleB',
        ruleSelector: (i) => i.Modality === 'NM',
        splitKey: [() => 'same'],
      },
    ];
    const seriesInfo = buildSeriesInfo(insts, rules);
    const groups = groupInstancesBySplitRules(insts, rules, seriesInfo);

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

  it('reports instances that match no rule via onUnmatched', () => {
    const insts: NaturalizedInstance[] = [
      { imageId: 'a', Modality: 'CT' },
      { imageId: 'b', Modality: 'SR' },
    ];
    const rules: SplitRule[] = [
      {
        id: 'ct',
        ruleSelector: (i) => i.Modality === 'CT',
        splitKey: ['imageId'],
      },
    ];
    const seriesInfo = buildSeriesInfo(insts, rules);
    const unmatched: string[] = [];

    const groups = groupInstancesBySplitRules(insts, rules, seriesInfo, (i) =>
      unmatched.push(i.imageId!)
    );

    expect(unmatched).toEqual(['b']);
    expect(groups).toHaveLength(1);
  });
});
