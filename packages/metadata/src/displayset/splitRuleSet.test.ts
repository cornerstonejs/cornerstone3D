import { describe, expect, it } from '@jest/globals';
import { groupInstancesBySplitRules } from './groupInstancesBySplitRules';
import { createDisplaySetSplitRules } from './rawDisplaySetSelector';
import { resolveSplitRuleSet, validateSplitRuleSetEntry } from './splitRuleSet';
import type {
  InstanceGroup,
  NaturalizedInstance,
  SplitRule,
  SplitRuleSet,
} from './types';

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

  it('excludes a rule with a null priority', () => {
    const rules = resolveSplitRuleSet({
      kept: { priority: 1 },
      excluded: { priority: null },
    });

    expect(rules.map((rule) => rule.id)).toEqual(['kept']);
  });

  it('rejects an entry whose id differs from its key', () => {
    expect(() =>
      resolveSplitRuleSet({ volume3d: { id: 'other', priority: 1 } })
    ).toThrow(/"volume3d".*states id "other"/);
  });

  it('rejects an entry with no usable priority', () => {
    expect(() =>
      resolveSplitRuleSet({
        missing: {} as SplitRuleSet[string],
      })
    ).toThrow(/"missing".*priority must be a finite number/);
    expect(() =>
      resolveSplitRuleSet({ nan: { priority: Number.NaN } })
    ).toThrow(/"nan".*priority/);
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
  it('returns true for an entry with a numeric priority', () => {
    expect(validateSplitRuleSetEntry('a', { priority: 0 })).toBe(true);
    expect(validateSplitRuleSetEntry('a', { id: 'a', priority: -2.5 })).toBe(
      true
    );
  });

  it('returns false for an entry with a null priority', () => {
    expect(validateSplitRuleSetEntry('a', { priority: null })).toBe(false);
  });

  it('throws for an id that differs from the key', () => {
    expect(() =>
      validateSplitRuleSetEntry('a', { id: 'b', priority: 1 })
    ).toThrow(/Invalid split rule set entry "a".*states id "b"/);
  });

  it('throws for a missing or non-numeric priority', () => {
    expect(() => validateSplitRuleSetEntry('a', {})).toThrow(
      /"a".*priority must be a finite number/
    );
    expect(() =>
      validateSplitRuleSetEntry('a', { priority: '1' as unknown as number })
    ).toThrow(/"a".*priority must be a finite number.*got "1"/);
    expect(() =>
      validateSplitRuleSetEntry('a', { priority: Number.POSITIVE_INFINITY })
    ).toThrow(/"a".*priority/);
  });

  it('throws for an entry that is not an object', () => {
    expect(() => validateSplitRuleSetEntry('a', null)).toThrow(
      /"a".*must be an object/
    );
  });
});

describe('groupInstancesBySplitRules with a rule set', () => {
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

  it('skips a rule with a null priority', () => {
    const groups = groupInstancesBySplitRules([ct('a', 1)], {
      off: { priority: null, groupBy: ['SOPInstanceUID'] },
      on: { priority: 1 },
    });

    expect(groups.map((group) => group.matchedRule.id)).toEqual(['on']);
  });
});

describe('createDisplaySetSplitRules with a raw rule set', () => {
  it('compiles to a keyed rule set that resolves in priority order', () => {
    const rules = createDisplaySetSplitRules({
      catchAll: { priority: 2 },
      ctRule: { priority: 1, matches: { attribute: 'Modality', equals: 'CT' } },
      off: { priority: null, matches: { attribute: 'Modality', equals: 'MR' } },
    });

    expect(resolveSplitRuleSet(rules).map((rule) => rule.id)).toEqual([
      'ctRule',
      'catchAll',
    ]);
    expect(rules.ctRule.matches?.(ct('a', 1), { series: {} })).toBe(true);
  });
});

describe('runBy keys', () => {
  const us = (
    imageId: string,
    InstanceNumber: number,
    NumberOfFrames?: number
  ): NaturalizedInstance => ({
    imageId,
    Modality: 'US',
    SeriesInstanceUID: 'us-series',
    SOPInstanceUID: `sop-${imageId}`,
    InstanceNumber,
    ...(NumberOfFrames === undefined ? {} : { NumberOfFrames }),
  });

  const usRunRule: SplitRule = {
    id: 'usInterleaved',
    runBy: (i) => Number(i.NumberOfFrames ?? 1) > 1,
  };

  const keyOf = (groups: InstanceGroup[], imageId: string) =>
    groups.find((group) => group.instances.some((i) => i.imageId === imageId))
      ?.splitKey;

  it('keys a run by its first instance, not by its ordinal', () => {
    const groups = groupInstancesBySplitRules(
      [us('img1', 1), us('img2', 2), us('clip3', 3, 60)],
      { usInterleaved: { ...usRunRule, priority: 1 } }
    );

    expect(groups.map((group) => group.splitKey)).toEqual([
      JSON.stringify(['usInterleaved', 'us-series', 'sop-img1']),
      JSON.stringify(['usInterleaved', 'us-series', 'sop-clip3']),
    ]);
  });

  it('keeps the keys of later runs when a new run appears earlier in the series', () => {
    // With ordinal keys, clip2 arriving late turns [img1, img3] [clip4] into
    // [img1] [clip2] [img3] [clip4]: ordinal 1 moves from clip4 to clip2, so a
    // host that reconciles by key merges two unrelated clips into one display
    // set. With first-instance keys, clip4 keeps its key.
    const before = groupInstancesBySplitRules(
      [us('img1', 1), us('img3', 3), us('clip4', 4, 60)],
      { usInterleaved: { ...usRunRule, priority: 1 } }
    );
    const after = groupInstancesBySplitRules(
      [us('img1', 1), us('clip2', 2, 45), us('img3', 3), us('clip4', 4, 60)],
      { usInterleaved: { ...usRunRule, priority: 1 } }
    );

    expect(keyOf(after, 'clip4')).toBe(keyOf(before, 'clip4'));
    // The split run keeps its key on the part that holds its first instance,
    // and loses img3 to a new run - a host must still expect that.
    expect(keyOf(after, 'img1')).toBe(keyOf(before, 'img1'));
    expect(keyOf(after, 'img3')).not.toBe(keyOf(before, 'img3'));
    expect(after.map((group) => group.instances.map((i) => i.imageId))).toEqual(
      [['img1'], ['clip2'], ['img3'], ['clip4']]
    );
  });

  it('orders runs by their position in the series, not by their key', () => {
    // 'sop-a-clip' sorts before 'sop-z-single' as a string, but the single
    // comes first in acquisition order.
    const groups = groupInstancesBySplitRules(
      [us('z-single', 1), us('a-clip', 2, 30)],
      { usInterleaved: { ...usRunRule, priority: 1 } }
    );

    expect(groups.map((group) => group.instances[0].imageId)).toEqual([
      'z-single',
      'a-clip',
    ]);
  });
});
