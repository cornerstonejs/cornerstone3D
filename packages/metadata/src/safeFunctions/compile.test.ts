import { compileCondition, compileValue } from './compile';
import { conditionShape, describeShape } from './schema';

describe('compileCondition / compileValue - strict and stand-alone', () => {
  it('names a stand-alone definition and its path in a message', () => {
    expect(() =>
      compileCondition({ Modality: { equal: 'CT' } } as never)
    ).toThrow(
      /^Invalid safe function definition: Modality: unknown operator 'equal'; allowed: equals,/
    );
    expect(() =>
      compileCondition({ Rows: { greaterThan: 'x' } } as never, {
        path: 'protocol.match',
        definition: 'hanging protocol',
      })
    ).toThrow(
      /^Invalid hanging protocol: protocol\.match\.Rows: the operand of greaterThan must be a finite number/
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

  it('describes the accepted forms from the schema', () => {
    expect(describeShape(conditionShape)).toBe('{ <any key> }, or a function');
  });
});
