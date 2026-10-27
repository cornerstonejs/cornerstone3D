import { compileCondition, compileValue } from './compile';
import { MATCH_HELPERS } from './matchTests';
import { RuleCompileError } from './schema';

describe('membership - the cached Set of a long list', () => {
  // 50 UIDs; '7' and 'true' test a number and a boolean.
  const uids = [
    ...Array.from({ length: 48 }, (_, i) => `1.2.840.10008.5.1.4.1.1.${i}`),
    '7',
    'true',
  ];
  // -1 equals no value below, and keeps this list on the loop.
  const loopList = [...uids, -1];
  const cases: [unknown, boolean][] = [
    ['1.2.840.10008.5.1.4.1.1.4', true],
    ['9.9', false],
    [7, true],
    ['07', false],
    [true, true],
    [false, false],
    ['', false],
    [null, false],
    [undefined, false],
    [[], false],
    [['x', '1.2.840.10008.5.1.4.1.1.5'], true],
    [['x', 'y'], false],
  ];

  it('gives the result of the loop in matches and in the in operator', () => {
    const viaSet = compileCondition({ X: uids });
    const viaLoop = compileCondition({ X: loopList });
    for (const [X, expected] of cases) {
      expect([X, viaSet({ X }), viaLoop({ X })]).toEqual([
        X,
        expected,
        expected,
      ]);
      expect([
        X,
        MATCH_HELPERS.includes(uids, X),
        MATCH_HELPERS.includes(loopList, X),
      ]).toEqual([X, expected, expected]);
    }
  });
});

const errorOf = (compile: () => unknown): RuleCompileError => {
  try {
    compile();
  } catch (error) {
    expect(error).toBeInstanceOf(RuleCompileError);
    return error as RuleCompileError;
  }
  throw new Error('expected a compile error');
};

describe('compileCondition / compileValue - strict and stand-alone', () => {
  it('names a stand-alone definition and its path in a message', () => {
    const standAlone = errorOf(() =>
      compileCondition({ Modality: { equal: 'CT' } } as never)
    );
    expect(standAlone.definition).toBe('safe function definition');
    expect(standAlone.path).toBe('Modality');
    expect(standAlone.message).toContain("'equal'");

    const named = errorOf(() =>
      compileCondition({ Rows: { greaterThan: 'x' } } as never, {
        path: 'protocol.match',
        definition: 'hanging protocol',
      })
    );
    expect(named.definition).toBe('hanging protocol');
    expect(named.path).toBe('protocol.match.Rows');
    // The message starts with the definition and the path, for the user.
    expect(named.message).toMatch(
      /^Invalid hanging protocol: protocol\.match\.Rows: /
    );
  });

  it('passes an actual function through as is', () => {
    const predicate = () => true;
    const reader = () => 42;
    expect(compileCondition(predicate)).toBe(predicate);
    expect(compileValue(reader)).toBe(reader);
    expect(
      compileCondition({ Rows: (value) => value === 2 })({ Rows: 2 })
    ).toBe(true);
  });

  it('reads a name through the reader of the place', () => {
    const readName = (name: string) => () => `${name}!`;
    expect(compileValue('anything', { readName })({})).toBe('anything!');
    expect(
      compileValue({ template: '<{a}>' }, { readName })({}, undefined)
    ).toBe('<a!>');
  });

  it('reads own properties only by default', () => {
    expect(compileValue('constructor')({})).toBeUndefined();
    expect(compileCondition({ toString: null })({})).toBe(true);
  });
});
