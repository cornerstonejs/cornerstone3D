import { compileCondition, compileValue } from './compile';
import { RuleCompileError } from './schema';

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
