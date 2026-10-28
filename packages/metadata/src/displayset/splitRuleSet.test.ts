import { describe, expect, it } from '@jest/globals';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import { createDisplaySetSplitRules } from './displaySetRules';
import { resolveSplitRuleSet, validateSplitRuleSetEntry } from './splitRuleSet';
import type { NaturalizedInstance, SplitRuleSet } from './types';

const ct = (imageId: string, InstanceNumber: number): NaturalizedInstance => ({
  imageId,
  Modality: 'CT',
  SeriesInstanceUID: 'series-1',
  SOPInstanceUID: `sop-${imageId}`,
  InstanceNumber,
});

describe('resolveSplitRuleSet', () => {
  it('orders rules by ascending priority, and takes the id from the key', () => {
    const rules = resolveSplitRuleSet({
      late: { priority: 20000 },
      defaultA: { priority: 1 },
      early: { priority: -1 },
      defaultB: { priority: 2 },
    });

    expect(rules.map((rule) => rule.id)).toEqual([
      'early',
      'defaultA',
      'defaultB',
      'late',
    ]);
    // Priority belongs to the rule set, not to the compiled rule.
    expect(rules.every((rule) => !('priority' in rule))).toBe(true);
  });

  it('orders equal priorities by id, whatever order the keys were inserted in', () => {
    const forward = resolveSplitRuleSet({
      b: { priority: 5 },
      a: { priority: 5 },
    });
    const reverse = resolveSplitRuleSet({
      a: { priority: 5 },
      b: { priority: 5 },
    });

    expect(forward.map((rule) => rule.id)).toEqual(['a', 'b']);
    expect(reverse.map((rule) => rule.id)).toEqual(['a', 'b']);
  });

  it('accepts an entry that states an id equal to its key', () => {
    const rules = resolveSplitRuleSet({ same: { id: 'same', priority: 1 } });

    expect(rules.map((rule) => rule.id)).toEqual(['same']);
  });

  it('rejects an array', () => {
    expect(() =>
      resolveSplitRuleSet([{ id: 'a' }] as unknown as SplitRuleSet)
    ).toThrow(/must be an object keyed by rule id/);
  });
});

describe('validateSplitRuleSetEntry', () => {
  it('returns true for a numeric priority, and false for a null priority', () => {
    expect(validateSplitRuleSetEntry('a', { priority: 0 })).toBe(true);
    expect(validateSplitRuleSetEntry('a', { id: 'a', priority: -2.5 })).toBe(
      true
    );
    expect(validateSplitRuleSetEntry('a', { priority: null })).toBe(false);
  });

  it('throws for an id that differs from the key', () => {
    expect(() =>
      validateSplitRuleSetEntry('a', { id: 'b', priority: 1 })
    ).toThrow(/"a".*"b"/);
  });

  it('throws for a missing or non-numeric priority', () => {
    for (const priority of [undefined, '1', Number.NaN, Infinity]) {
      expect(() =>
        validateSplitRuleSetEntry('a', { priority } as never)
      ).toThrow(/"a".*priority/);
    }
  });

  it('throws for an entry that is not an object', () => {
    expect(() => validateSplitRuleSetEntry('a', null)).toThrow(
      /"a".*must be an object/
    );
  });
});

describe('groupInstancesBySplitRules with a rule set', () => {
  it('gives one key for every naturalized form of a value', () => {
    // A server and a viewer can naturalize the same attribute differently.
    const keyOf = (EchoNumbers: unknown) =>
      groupInstancesBySplitRules([{ ...ct('a', 1), EchoNumbers } as never], {
        byEcho: { priority: 1, groupBy: ['SeriesInstanceUID', 'EchoNumbers'] },
      })[0].splitKey;

    expect(new Set([5, '5', [5], ['5']].map(keyOf)).size).toBe(1);
    expect(new Set([undefined, null, '', []].map(keyOf)).size).toBe(1);
    // Text that is not the canonical form of a number stays text.
    expect(keyOf('05')).not.toBe(keyOf(5));
  });

  it('evaluates the rules in priority order, first match wins', () => {
    const ruleSet: SplitRuleSet = {
      everything: { priority: 1, groupBy: ['SeriesInstanceUID'] },
      first: {
        priority: -1,
        matches: (instance) => instance.InstanceNumber === 1,
        groupBy: ['SOPInstanceUID'],
      },
    };

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

  it('lets a layer replace a rule by its key', () => {
    // A key cannot occur twice, so a later layer that names an existing id
    // replaces that rule instead of adding a second copy.
    const defaults: SplitRuleSet = {
      volume3d: { priority: 1, groupBy: ['SeriesInstanceUID'] },
    };
    const layered: SplitRuleSet = {
      ...defaults,
      volume3d: { priority: -1, groupBy: ['SOPInstanceUID'] },
    };

    const groups = groupInstancesBySplitRules(
      [ct('a', 1), ct('b', 2)],
      layered
    );

    // The replacement groups per instance: two groups, not one per series.
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.matchedRule.id === 'volume3d')).toBe(
      true
    );
  });
});

describe('createDisplaySetSplitRules with a rule set as data', () => {
  it('compiles to a keyed rule set that resolves in priority order', () => {
    const rules = createDisplaySetSplitRules({
      catchAll: { priority: 2 },
      ctRule: { priority: 1, matches: { Modality: 'CT' } },
      off: { priority: null, matches: { Modality: 'MR' } },
    });

    expect(resolveSplitRuleSet(rules).map((rule) => rule.id)).toEqual([
      'ctRule',
      'catchAll',
    ]);
    expect(rules.ctRule.matches?.(ct('a', 1), { series: {} })).toBe(true);
  });
});
