import { compileCondition, compileValue } from './compile';
import { conditionShape, describeShape, readOwn } from './schema';

describe('compileCondition / compileValue - strict and stand-alone', () => {
  it('names a stand-alone definition and its path in a message', () => {
    expect(() =>
      compileCondition({
        attribute: 'Modality',
        equals: 'CT',
        extra: 1,
      } as never)
    ).toThrow(
      /^Invalid safe function definition: unknown key 'extra'; allowed: attribute,/
    );
    expect(() =>
      compileCondition(
        { attribute: 'Modality', equal: 'CT' } as never,
        {},
        {
          path: 'protocol.match',
          definition: 'hanging protocol',
        }
      )
    ).toThrow(
      /^Invalid hanging protocol: protocol\.match: unknown key 'equal'/
    );
  });

  it('passes an actual function through as is', () => {
    const predicate = () => true;
    const reader = () => 42;
    expect(compileCondition(predicate)).toBe(predicate);
    expect(compileValue(reader)).toBe(reader);
    expect(compileCondition({ not: predicate })({})).toBe(false);
  });

  it('uses the expression variables of the place', () => {
    const options = {
      expression: { params: ['a', 'b'], implicitScope: false as const },
    };
    expect(
      compileValue(
        { expression: 'a.x + b.x' },
        {},
        options
      )({ x: 1 }, {
        x: 2,
      } as never)
    ).toBe(3);
    expect(() => compileCondition('x > 1', {}, options)).toThrow(
      /'x' is not a parameter/
    );
  });

  it('reads own properties only', () => {
    expect(readOwn({}, 'toString')).toBeUndefined();
    expect(readOwn({ toString: 1 }, 'toString')).toBe(1);
    expect(readOwn(null, 'a')).toBeUndefined();
    expect(compileValue('constructor')({})).toBeUndefined();
    expect(
      compileCondition({ seriesFact: 'hasOwnProperty' })({}, { series: {} })
    ).toBe(false);
  });

  it('describes the accepted forms from the schema', () => {
    expect(describeShape(conditionShape)).toContain('{ all }');
    expect(describeShape(conditionShape)).toMatch(/, or a function$/);
  });
});
