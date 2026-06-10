import { describe, expect, it } from '@jest/globals';
import { buildSeriesInfo } from './buildSeriesInfo';
import { createDisplaySetFromGroup } from './createDisplaySetFromGroup';
import { defaultDisplaySetSplitRules } from './defaultDisplaySetSplitRules';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import { ImageStackDisplaySet } from './ImageStackDisplaySet';
import { resolveInstances } from './resolveInstances';
import { splitSeriesInstanceGroupsFromImageIds } from './splitSeriesInstanceGroupsFromImageIds';
import type { NaturalizedInstance, SplitRule } from './types';
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
    const groups = splitSeriesInstanceGroupsFromImageIds(
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
    const groups = splitSeriesInstanceGroupsFromImageIds(['wadors:video'], {
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
    const groups = splitSeriesInstanceGroupsFromImageIds(['wadors:ecg'], {
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
    const groups = splitSeriesInstanceGroupsFromImageIds(
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
      displaySetInstanceUID: 'uid-1',
      viewportTypes: ['stack', 'volume', 'volume3d'],
    });
    expect(displaySet.underlyingImageIds.length).toBe(2);
    expect(displaySet.viewportTypes[0]).toBe('stack');
    expect(displaySet.preferredViewportType).toBe('stack');
  });

  it('groups by default image rule into a single bucket', () => {
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
    const groups = splitSeriesInstanceGroupsFromImageIds(['wadors:mf'], {
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
});
