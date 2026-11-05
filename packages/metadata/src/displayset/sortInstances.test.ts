import {
  compareInstanceNumber,
  sortByInstanceNumber,
  sortInstancesCopy,
} from './sortInstances';
import type { NaturalizedInstance, RuleContext } from './types';

const uids = (instances: NaturalizedInstance[]) =>
  instances.map((instance) => instance.SOPInstanceUID);

describe('sortByInstanceNumber - the default instance order', () => {
  const CASES: [string, NaturalizedInstance[], string[]][] = [
    [
      'orders by InstanceNumber, also a numeric string',
      [
        { SOPInstanceUID: 'c', InstanceNumber: 10 },
        { SOPInstanceUID: 'a', InstanceNumber: 2 },
        { SOPInstanceUID: 'b', InstanceNumber: '3' as unknown as number },
      ],
      ['a', 'b', 'c'],
    ],
    [
      'puts an absent InstanceNumber after the numbered instances, not at 0',
      [
        { SOPInstanceUID: 'none' },
        { SOPInstanceUID: 'one', InstanceNumber: 1 },
        { SOPInstanceUID: 'zero', InstanceNumber: 0 },
      ],
      ['zero', 'one', 'none'],
    ],
    [
      'orders equal numbers by SOPInstanceUID',
      [
        { SOPInstanceUID: '1.2.9', InstanceNumber: 1 },
        { SOPInstanceUID: '1.2.3', InstanceNumber: 1 },
      ],
      ['1.2.3', '1.2.9'],
    ],
  ];

  for (const [name, instances, expected] of CASES) {
    it(`${name}, and returns a copy`, () => {
      const input = [...instances];
      expect(uids(sortInstancesCopy(input))).toEqual(expected);
      expect(input).toEqual(instances);
    });
  }

  it('passes context down a custom comparator chain', () => {
    const context = { series: {} } as RuleContext;
    const seen: unknown[] = [];
    const byNumberThenDescription = (
      a: NaturalizedInstance,
      b: NaturalizedInstance,
      ctx?: RuleContext
    ) => {
      seen.push(ctx);
      return (
        compareInstanceNumber(a, b, ctx) ||
        String(b.SeriesDescription).localeCompare(
          String(a.SeriesDescription)
        ) ||
        sortByInstanceNumber(a, b, ctx)
      );
    };
    const sorted = sortInstancesCopy(
      [
        { SOPInstanceUID: 'x', InstanceNumber: 1, SeriesDescription: 'A' },
        { SOPInstanceUID: 'y', InstanceNumber: 1, SeriesDescription: 'B' },
      ],
      byNumberThenDescription,
      context
    );
    expect(uids(sorted)).toEqual(['y', 'x']);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((value) => value === context)).toBe(true);
  });
});
