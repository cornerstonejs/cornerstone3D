import { createDisplaySetFromGroup } from './createDisplaySetFromGroup';
import {
  groupInstancesBySplitRules,
  orderInstancesForRule,
} from './groupInstancesBySplitRules';
import { createDisplaySetSplitRules } from './rawDisplaySetSelector';
import type { RawDisplaySetSelector } from './rawDisplaySetSelectorTypes';
import { planeGeometry, timeClusters } from './seriesFunctions';
import type { PlaneGeometry, TimeClusters } from './seriesFunctions';
import type { NaturalizedInstance } from './types';

const AXIAL = [1, 0, 0, 0, 1, 0];

const slice = (
  id: string,
  z: number,
  overrides: Partial<NaturalizedInstance> = {}
): NaturalizedInstance => ({
  SOPInstanceUID: id,
  SeriesInstanceUID: 'series-1',
  Modality: 'CT',
  ImageOrientationPatient: AXIAL,
  ImagePositionPatient: [0, 0, z],
  ...overrides,
});

const CT_SOP_CLASS = '1.2.840.10008.5.1.4.1.1.2';

describe('the display set context over a split', () => {
  // The regularVolume module: one series value in the global context, read by
  // two rules.
  const options = {
    displaySetContext: {
      mixesIrregular:
        'planeGeometry.regularCount >= 3 && planeGeometry.irregularCount > 0 && planeGeometry.complete',
    },
  };
  const selector: RawDisplaySetSelector = {
    regularVolume: {
      priority: -2,
      matches: {
        isStackImage: true,
        Modality: ['CT', 'MR', 'PT', 'NM'],
        mixesIrregular: true,
        sliceIndex: { notNull: true },
      },
      groupBy: ['SeriesInstanceUID'],
      sortBy: ['sliceDistance'],
      attributes: {
        SeriesDescription: {
          template: '{SeriesDescription} ({sliceSpacing} mm)',
        },
      },
    },
    irregularImages: {
      priority: -1,
      matches: {
        isStackImage: true,
        Modality: ['CT', 'MR', 'PT', 'NM'],
        mixesIrregular: true,
        sliceIndex: null,
      },
      groupBy: ['SeriesInstanceUID'],
      attributes: {
        SeriesDescription: { template: '{SeriesDescription} (other images)' },
      },
    },
  };
  const series = [
    slice('r3', 7.5),
    slice('r0', 0),
    slice('low', -1.3),
    slice('r1', 2.5),
    slice('r4', 10),
    slice('r2', 5),
    slice('mid', 3.7),
  ].map((instance) => ({
    ...instance,
    SOPClassUID: CT_SOP_CLASS,
    Rows: 512,
    SeriesDescription: 'AX',
  }));

  it('splits the lattice from the other images, and labels each display set from the whole series', () => {
    const groups = groupInstancesBySplitRules(
      series,
      createDisplaySetSplitRules(selector, options)
    );
    expect(
      groups.map((group) => [
        group.matchedRule.id,
        group.instances.map((i) => i.SOPInstanceUID),
        (createDisplaySetFromGroup(group) as unknown as Record<string, unknown>)
          .SeriesDescription,
      ])
    ).toEqual([
      ['regularVolume', ['r0', 'r1', 'r2', 'r3', 'r4'], 'AX (2.5 mm)'],
      ['irregularImages', ['low', 'mid'], 'AX (other images)'],
    ]);
  });
});

describe('a sort after the series gets new instances', () => {
  it('computes the context values again, so the new instance takes its place', () => {
    const rules = createDisplaySetSplitRules({
      bySlice: { priority: 1, sortBy: ['sliceDistance'] },
    });
    const [group] = groupInstancesBySplitRules(
      [slice('z4', 4), slice('z0', 0), slice('z2', 2)],
      rules
    );
    const reordered = orderInstancesForRule(
      [...group.instances, slice('z1', 1)],
      group.matchedRule,
      { series: group.series }
    );
    expect(
      reordered.map(
        (instance) => (instance.ImagePositionPatient as number[])[2]
      )
    ).toEqual([0, 1, 2, 4]);
  });
});

describe('planeGeometry', () => {
  // Regular 2.5 mm slices at 0..10, an outlier at -1.3 below the lattice, one
  // slice at 3.7 between two lattice positions, and one sagittal image.
  const series = [
    slice('r0', 0),
    slice('r1', 2.5),
    slice('r2', 5),
    slice('r3', 7.5),
    slice('r4', 10),
    slice('low', -1.3),
    slice('mid', 3.7),
    slice('sag', 0, { ImageOrientationPatient: [0, 1, 0, 0, 0, 1] }),
  ];
  const geometry = (instances: NaturalizedInstance[]) =>
    planeGeometry(instances, { args: {} }) as PlaneGeometry;

  it('finds the regular lattice, and leaves the other instances off it', () => {
    const result = geometry(series);

    expect(result.spacing).toBe(2.5);
    expect(result.normal).toEqual([0, 0, 1]);
    expect(result.origin).toEqual([0, 0, 0]);
    expect(result.index).toEqual({ r0: 0, r1: 1, r2: 2, r3: 3, r4: 4 });
    expect([
      result.regularCount,
      result.irregularCount,
      result.positions,
      result.complete,
      result.duplicates,
    ]).toEqual([5, 3, 5, true, false]);
    expect(result.distance.low).toBeCloseTo(-1.3);
  });

  it('gives the same result for any order of the instances', () => {
    expect(geometry([...series].reverse())).toEqual(geometry(series));
  });
});

describe('timeClusters', () => {
  const us = (id: string, AcquisitionTime: string): NaturalizedInstance => ({
    SOPInstanceUID: id,
    AcquisitionDate: '20260101',
    AcquisitionTime,
  });

  it('starts a cluster after a gap of more than maxGap seconds', () => {
    const result = timeClusters(
      [
        us('a', '100000'),
        us('b', '100004'),
        us('c', '100100'),
        us('d', '100103.5'),
        { SOPInstanceUID: 'untimed' },
      ],
      { args: { maxGap: 10 } }
    ) as TimeClusters;
    const startOf = (id: string) => result.start[id] - (result.first as number);

    expect(result.clusters).toBe(2);
    expect(result.untimedCount).toBe(1);
    expect(['a', 'b', 'c', 'd'].map(startOf)).toEqual([0, 0, 60, 60]);
  });
});
