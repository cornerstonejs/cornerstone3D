import { describe, expect, it, jest } from '@jest/globals';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import { createDisplaySetSplitRules } from './displaySetRules';
import update, { extend } from 'immutability-helper';
import {
  materializeSplitRules,
  resolveSplitRuleSet,
  spliceById,
} from './splitRuleSet';
import type { NaturalizedInstance, SplitRuleSet } from './types';

const ct = (imageId: string, InstanceNumber: number): NaturalizedInstance => ({
  imageId,
  Modality: 'CT',
  SeriesInstanceUID: 'series-1',
  SOPInstanceUID: `sop-${imageId}`,
  InstanceNumber,
});

describe('materializeSplitRules', () => {
  it('returns the rules in the order of the list, each with its key as id, and leaves out a rule the list does not name', () => {
    const rules = materializeSplitRules(
      { a: { groupBy: ['a'] }, b: { id: 'b' }, unused: {} },
      ['b', 'a']
    );

    expect(rules).toEqual([{ id: 'b' }, { id: 'a', groupBy: ['a'] }]);
  });

  it('throws for an unknown id, a duplicate id, an id mismatch, a non-object entry and an unsafe key', () => {
    expect(() => materializeSplitRules({ a: {} }, ['x'])).toThrow(
      /"x".*not in the registry/
    );
    expect(() => materializeSplitRules({ a: { id: 'b' } }, ['a'])).toThrow(
      /"a".*"b"/
    );
    expect(() => materializeSplitRules({ a: null } as never, ['a'])).toThrow(
      /"a".*must be an object/
    );
    expect(() => materializeSplitRules({}, ['__proto__'])).toThrow(
      /not allowed/
    );
  });
});

describe('spliceById', () => {
  const order = ['video', 'ecg', 'localizer', 'volume3d', 'unsupported'];

  it('as $spliceById: inserts, removes and moves by id, each entry after the earlier ones', () => {
    extend('$spliceById', (spec, list) => spliceById(list as string[], spec));

    expect(
      update(order, { $spliceById: [['volume3d', 0, 'dwiByBValue']] } as never)
    ).toEqual([
      'video',
      'ecg',
      'localizer',
      'dwiByBValue',
      'volume3d',
      'unsupported',
    ]);
    expect(update(order, { $spliceById: [['ecg', 1]] } as never)).toEqual([
      'video',
      'localizer',
      'volume3d',
      'unsupported',
    ]);
    expect(
      spliceById(order, [
        ['volume3d', 1],
        ['localizer', 0, 'volume3d'],
      ])
    ).toEqual(['video', 'ecg', 'volume3d', 'localizer', 'unsupported']);
    expect(spliceById([{ id: 'a' }, { id: 'b' }], [['b', 1]])).toEqual([
      { id: 'a' },
    ]);
  });

  it('throws for an unknown id and for a numeric position', () => {
    expect(() => spliceById(order, [['missing', 1]])).toThrow(/"missing"/);
    expect(() => spliceById(order, [[1, 1]])).toThrow(/Use \$splice/);
    expect(() => spliceById(order, [['ecg']])).toThrow(/deleteCount/);
    expect(() => spliceById(order, [['ecg', '1']])).toThrow(/deleteCount/);
  });
});

describe('materializeSplitRules with a repeated id', () => {
  it('keeps the first place and warns once, as when two files add the same rule', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const rules = materializeSplitRules({ a: {}, b: {} }, [
        'a',
        'b',
        'a',
        'a',
      ]);
      expect(rules.map((rule) => rule.id)).toEqual(['a', 'b']);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/a occurs more than once/);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('resolveSplitRuleSet', () => {
  it('rejects a keyed object', () => {
    expect(() =>
      resolveSplitRuleSet({ a: {} } as unknown as SplitRuleSet)
    ).toThrow(/must be an array/);
  });
});

describe('groupInstancesBySplitRules with a rule set', () => {
  it('gives one key for every naturalized form of a value', () => {
    // A server and a viewer can naturalize the same attribute differently.
    const keyOf = (EchoNumbers: unknown) =>
      groupInstancesBySplitRules(
        [{ ...ct('a', 1), EchoNumbers } as never],
        [{ id: 'byEcho', groupBy: ['SeriesInstanceUID', 'EchoNumbers'] }]
      )[0].splitKey;

    expect(new Set([5, '5', [5], ['5']].map(keyOf)).size).toBe(1);
    expect(new Set([undefined, null, '', []].map(keyOf)).size).toBe(1);
    // Text that is not the canonical form of a number stays text.
    expect(keyOf('05')).not.toBe(keyOf(5));
  });

  it('evaluates the rules in array order, first match wins', () => {
    const ruleSet: SplitRuleSet = [
      {
        id: 'first',
        matches: (instance) => instance.InstanceNumber === 1,
        groupBy: ['SOPInstanceUID'],
      },
      { id: 'everything', groupBy: ['SeriesInstanceUID'] },
    ];

    const groups = groupInstancesBySplitRules(
      [ct('a', 1), ct('b', 2), ct('c', 3)],
      ruleSet
    );

    expect(
      groups.map((group) => [
        group.matchedRule.id,
        group.instances.map((i) => i.imageId),
      ])
    ).toEqual([
      ['first', ['a']],
      ['everything', ['b', 'c']],
    ]);
  });

  it('warns once with the count when instances match no rule and no callback is given', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const groups = groupInstancesBySplitRules(
        [ct('a', 1), ct('b', 2)],
        [{ id: 'none', matches: () => false }]
      );
      expect(groups).toEqual([]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toMatch(/: 2 instance/);
    } finally {
      warn.mockRestore();
    }
  });
});

describe('createDisplaySetSplitRules with a rule set as data', () => {
  it('compiles an ordered array, in the same order', () => {
    const rules = createDisplaySetSplitRules([
      { id: 'ctRule', matches: { Modality: 'CT' } },
      { id: 'catchAll' },
    ]);

    expect(rules.map((rule) => rule.id)).toEqual(['ctRule', 'catchAll']);
    expect(rules[0].matches?.(ct('a', 1), { series: {} })).toBe(true);
  });
});
