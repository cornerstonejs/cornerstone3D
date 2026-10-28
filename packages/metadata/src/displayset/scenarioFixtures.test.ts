import { readFileSync } from 'fs';
import { join } from 'path';
import { createDisplaySetFromGroup } from './createDisplaySetFromGroup';
import { compiledDisplaySetRules } from './compiledDisplaySetRules';
import { createDisplaySetSplitRules, displaySetRules } from './displaySetRules';
import type { CreateDisplaySetSplitRulesOptions } from './displaySetRulesTypes';
import type { DisplaySetRules } from './displaySetRulesTypes';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import type { NaturalizedInstance, SplitRuleSet } from './types';
import {
  ctLocalizers,
  ctSeriesWithScouts,
  fourViewMammogram,
  geDiffusionSeries,
  t2SeriesWithZeroBValue,
  uidsOf,
  usSweepsAndClips,
} from './__fixtures__/scenarioInstances';

/**
 * Scenario tests: series shaped like real naturalized DICOM, split with real
 * rules. Each test states what the user sees: which display sets, with which
 * instances, in which order, and with which description.
 */

type DisplaySetView = {
  rule: string;
  uids: unknown[];
  description?: unknown;
};

/** The display sets of a split, as the user sees them. */
function displaySetsOf(
  instances: NaturalizedInstance[],
  rules: SplitRuleSet,
  read: (displaySet: Record<string, unknown>) => unknown = (displaySet) =>
    displaySet.SeriesDescription
): DisplaySetView[] {
  // Reverse the arrival order: the result must not depend on it.
  return groupInstancesBySplitRules([...instances].reverse(), rules).map(
    (group, splitNumber) => {
      const displaySet = createDisplaySetFromGroup(group, {
        splitNumber,
      }) as unknown as Record<string, unknown>;
      return {
        rule: displaySet.splitRuleId as string,
        uids: uidsOf(group.instances),
        description: read(displaySet),
      };
    }
  );
}

/** A rule set merged over the default rules, then compiled. */
function withDefaults(
  rules: DisplaySetRules,
  options?: CreateDisplaySetSplitRulesOptions
): SplitRuleSet {
  return createDisplaySetSplitRules({ ...displaySetRules, ...rules }, options);
}

const bySliceLocation = (a: NaturalizedInstance, b: NaturalizedInstance) =>
  (a.SliceLocation as number) - (b.SliceLocation as number);

/** The rule of the OHIF module split/dwiByBValue.jsonc. */
const dwiByBValue: DisplaySetRules = {
  dwiByBValue: {
    priority: -1,
    context: {
      bValue: 'Number(DiffusionBValue)',
      isDiffusion: 'series.instances.max(bValue) > 0',
    },
    matches: {
      Modality: 'MR',
      isDiffusion: true,
      isImage: true,
      DiffusionBValue: { notNull: true },
    },
    groupBy: ['SeriesInstanceUID', 'bValue'],
    sortBy: ['SliceLocation'],
    attributes: {
      SeriesDescription: {
        template: '{SeriesDescription} b={DiffusionBValue}',
      },
    },
  },
};

describe('diffusion MR', () => {
  it('splits a GE DWI series by the b-value of the private tag (0043,1039), only with a declaration of the tag', () => {
    const series = geDiffusionSeries();
    // The same rule as dwiByBValue, but the b-value is the first value of the
    // GE private tag.
    const geDwiByBValue: DisplaySetRules = {
      geDwiByBValue: {
        priority: -1,
        context: {
          geBValues: { attribute: '00431039', vr: 'IS', vm: '4' },
          bValue: 'Number(geBValues)',
          isDiffusion: 'series.instances.max(bValue) > 0',
        },
        matches: {
          Modality: 'MR',
          isDiffusion: true,
          isImage: true,
          bValue: { notNull: true },
        },
        groupBy: ['SeriesInstanceUID', 'bValue'],
        sortBy: ['SliceLocation'],
        attributes: {
          SeriesDescription: { template: '{SeriesDescription} b={bValue}' },
        },
      },
    };
    const atB = (bValue: string) =>
      uidsOf(
        series
          .filter((i) => (i['00431039'] as string[])[0] === bValue)
          .sort(bySliceLocation)
      );

    expect(displaySetsOf(series, withDefaults(geDwiByBValue))).toEqual([
      { rule: 'geDwiByBValue', uids: atB('0'), description: 'DWI ASSET b=0' },
      {
        rule: 'geDwiByBValue',
        uids: atB('1000'),
        description: 'DWI ASSET b=1000',
      },
    ]);
    expect(atB('0').length).toBe(32);

    // The default rules do not read the private tag: one display set.
    const defaults = displaySetsOf(series, compiledDisplaySetRules);
    expect(defaults.map((d) => [d.rule, d.uids.length])).toEqual([
      ['volume3d', 64],
    ]);
  });

  it('does not split an MR series whose images all carry DiffusionBValue = 0', () => {
    const series = t2SeriesWithZeroBValue();

    expect(displaySetsOf(series, withDefaults(dwiByBValue))).toEqual([
      {
        rule: 'volume3d',
        uids: uidsOf(series),
        description: undefined,
      },
    ]);
  });
});

describe('CT localizers', () => {
  /** The rule of the OHIF module split/scoutSeries.jsonc. */
  const ctScout: DisplaySetRules = {
    ctScout: {
      priority: -1,
      context: {
        isLocalizer: "includes(ImageType, 'LOCALIZER')",
        hasScout:
          'series.instances.count(isLocalizer) > 0 && ' +
          'series.instances.count(isLocalizer) < series.instances.count()',
      },
      matches: { Modality: 'CT', hasScout: true, isLocalizer: true },
      groupBy: ['SeriesInstanceUID'],
      attributes: {
        label: { template: 'SCOUT' },
        SeriesDescription: { template: 'SCOUT {SeriesDescription}' },
      },
    },
  };
  const rules = withDefaults(ctScout);
  const viewOf = (displaySet: Record<string, unknown>) => displaySet.label;

  it('puts the localizers of a mixed series in their own display set, and keeps the axial slices in volume3d', () => {
    const series = ctSeriesWithScouts();
    const localizers = series.slice(0, 2);
    const axial = series.slice(2);

    expect(displaySetsOf(series, rules, viewOf)).toEqual([
      {
        rule: 'ctScout',
        uids: uidsOf(localizers),
        description: 'SCOUT',
      },
      {
        rule: 'volume3d',
        uids: uidsOf(axial),
        description: undefined,
      },
    ]);
  });

  it('keeps a series of localizers only as one display set', () => {
    const series = ctLocalizers('1.2.392.200036.9116.2.6.1.48.1214833767.99');

    expect(displaySetsOf(series, rules).map((d) => [d.rule, d.uids])).toEqual([
      ['volume3d', uidsOf(series)],
    ]);
  });

  it('with the default rules alone, gives a localizer display set and a reconstructable volume', () => {
    const series = ctSeriesWithScouts();
    const isLocalizerAndVolume = (displaySet: Record<string, unknown>) => [
      displaySet.isLocalizer,
      displaySet.isReconstructable,
    ];

    expect(
      displaySetsOf(series, compiledDisplaySetRules, isLocalizerAndVolume)
    ).toEqual([
      {
        rule: 'localizer',
        uids: uidsOf(series.slice(0, 2)),
        description: [true, false],
      },
      {
        rule: 'volume3d',
        uids: uidsOf(series.slice(2)),
        description: [undefined, true],
      },
    ]);
  });
});

describe('ultrasound', () => {
  /** The rule of the OHIF module split/usTimeClusters.jsonc. */
  const usTimeClusters: DisplaySetRules = {
    usTimeClusters: {
      priority: -1,
      context: { timeClustersMaxGap: 20 },
      matches: {
        isImage: true,
        Modality: 'US',
        isMultiFrame: false,
        sweepCount: { greaterThan: 1 },
        sweepStart: { notNull: true },
      },
      groupBy: ['SeriesInstanceUID', 'sweepStart'],
      sortBy: ['acquisitionSeconds'],
      attributes: {
        SeriesDescription: {
          template: '{SeriesDescription} +{sweepOffset} s',
        },
      },
    },
  };
  const { instances, sweeps, clips } = usSweepsAndClips();
  const rules = withDefaults(usTimeClusters);

  it('makes one display set for each sweep of single images, in time order', () => {
    // 10:16:30 is 90 s after 10:15:00.
    expect(displaySetsOf(instances, rules).slice(0, 2)).toEqual([
      {
        rule: 'usTimeClusters',
        uids: uidsOf(sweeps[0]),
        description: 'US ABDOMEN +0 s',
      },
      {
        rule: 'usTimeClusters',
        uids: uidsOf(sweeps[1]),
        description: 'US ABDOMEN +90 s',
      },
    ]);
  });

  // US clips carry no SliceLocation, and must still be one display set each.
  it('keeps each cine clip of the series as its own display set', () => {
    expect(
      displaySetsOf(instances, rules)
        .slice(2)
        .map((d) => d.uids)
    ).toEqual(clips.map((clip) => uidsOf([clip])));
  });
});

describe('mammography', () => {
  it('splits a four-view series without ViewPosition into RCC, LCC, RMLO and LMLO with mammoViewSplit.json', () => {
    const ruleSet = JSON.parse(
      readFileSync(
        join(
          __dirname,
          '../../../core/examples/displaySetRules/mammoViewSplit.json'
        ),
        'utf8'
      )
    );
    // The host entries that the rule set requires, here as data.
    const viewCodeOf = (instance: NaturalizedInstance) =>
      (instance.ViewCodeSequence as { CodeValue?: string }[] | undefined)?.[0]
        ?.CodeValue;
    const options: CreateDisplaySetSplitRulesOptions = {
      context: {
        viewCode: viewCodeOf,
        mammoView: (instance: NaturalizedInstance) =>
          ({ 'R-10242': 'CC', 'R-10226': 'MLO' })[viewCodeOf(instance) ?? ''],
      },
    };
    expect(ruleSet.requires.context).toEqual(
      Object.keys(options.context ?? {}).sort()
    );

    const series = fourViewMammogram();
    const result = displaySetsOf(
      series,
      withDefaults(ruleSet.rules, options),
      (displaySet) => displaySet.descriptionName
    );

    expect(result.map((d) => d.rule)).toEqual(Array(4).fill('mammoViewSplit'));
    expect(
      Object.fromEntries(result.map((d) => [d.description, d.uids]))
    ).toEqual({
      RCC: uidsOf([series[0]]),
      LCC: uidsOf([series[1]]),
      RMLO: uidsOf([series[2]]),
      LMLO: uidsOf([series[3]]),
    });
  });
});
