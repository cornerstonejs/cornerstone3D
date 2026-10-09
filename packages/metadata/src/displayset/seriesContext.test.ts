import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
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

const split = (
  instances: NaturalizedInstance[],
  selector: RawDisplaySetSelector
) =>
  groupInstancesBySplitRules(instances, createDisplaySetSplitRules(selector));

describe('the shared series context', () => {
  it('lets the first rule that computes a name win, and every rule read it', () => {
    let evaluations = 0;
    const counted = (value: string) => () => {
      evaluations++;
      return value;
    };
    // The early rule claims nothing; it only computes the fact.
    const rules = createDisplaySetSplitRules(
      {
        early: {
          priority: 1,
          series: [{ name: 'shared', function: 'early' }],
          matches: { expression: 'false' },
        },
        late: {
          priority: 2,
          series: [{ name: 'shared', function: 'late' }],
          groupBy: [{ expression: 'context.series.shared' }],
        },
      },
      { seriesFunctions: { early: counted('early'), late: counted('late') } }
    );
    const [group] = groupInstancesBySplitRules([slice('a', 0)], rules);

    expect(group.matchedRule.id).toBe('late');
    expect(group.series).toEqual({ shared: 'early' });
    expect(group.splitKey).toBe(JSON.stringify(['late', 'early']));
    // The late rule's declaration of the same name is not computed.
    expect(evaluations).toBe(1);
  });

  it('computes a fact in a later rule when the earlier rule is turned off', () => {
    const [group] = groupInstancesBySplitRules(
      [slice('a', 0)],
      createDisplaySetSplitRules(
        {
          early: {
            priority: null,
            series: [{ name: 'shared', expression: "'early'" }],
          },
          late: {
            priority: 2,
            series: [{ name: 'shared', expression: "'late'" }],
          },
        },
        {}
      )
    );

    expect(group.series).toEqual({ shared: 'late' });
  });

  it('computes an expression fact over the series, after the earlier facts', () => {
    const [group] = split([slice('a', 0), slice('b', 5), slice('c', 10)], {
      rule: {
        priority: 1,
        series: [
          { name: 'count', expression: 'count(instances, true)' },
          { name: 'twice', expression: 'series.count * 2' },
          {
            name: 'hasTop',
            scope: 'some',
            when: { expression: 'ImagePositionPatient[2] >= 10' },
          },
        ],
      },
    });

    expect(group.series).toEqual({ count: 3, twice: 6, hasTop: true });
  });

  it('rejects an unknown series function and a name twice in one list', () => {
    expect(() =>
      createDisplaySetSplitRules({
        rule: { priority: 1, series: [{ name: 'x', function: 'nope' }] },
      })
    ).toThrow(
      /rule 'rule'\.series\[0\]\.function: unknown series function "nope"/
    );
    expect(() =>
      createDisplaySetSplitRules({
        rule: {
          priority: 1,
          series: [
            { name: 'x', expression: '1' },
            { name: 'x', expression: '2' },
          ],
        },
      })
    ).toThrow(
      /rule 'rule'\.series\[1\]: the fact name "x" is already in this list/
    );
  });

  it('gives customAttributes the series context that the host passes', () => {
    const [rule] = Object.values(
      createDisplaySetSplitRules({
        rule: {
          priority: 1,
          customAttributes: {
            fromFirstInstance: {
              label: {
                expression: '`${Modality} ${context.series.spacing} mm`',
              },
            },
          },
        },
      })
    );

    expect(
      rule.customAttributes?.(
        { instance: slice('a', 0) },
        { instances: [slice('a', 0)], series: { spacing: 2.5 } }
      )
    ).toEqual({ label: 'CT 2.5 mm' });
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
    planeGeometry(instances, { series: {}, args: {} }) as PlaneGeometry;

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
      { series: {}, args: { maxGap: 10 } }
    ) as TimeClusters;
    const startOf = (id: string) => result.start[id] - (result.first as number);

    expect(result.clusters).toBe(2);
    expect(result.untimedCount).toBe(1);
    expect(['a', 'b', 'c', 'd'].map(startOf)).toEqual([0, 0, 60, 60]);
  });
});
