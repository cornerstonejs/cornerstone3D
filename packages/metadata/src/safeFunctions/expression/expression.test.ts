import {
  collectIdentifiers,
  collectReads,
  compileExpression,
  ExpressionSyntaxError,
  parseExpressionSource,
} from './index';

describe('compileExpression', () => {
  describe('literals and operators', () => {
    it('evaluates arithmetic and precedence', () => {
      expect(compileExpression('1 + 2 * 3')()).toBe(7);
      expect(compileExpression('(1 + 2) * 3')()).toBe(9);
      expect(compileExpression('10 % 3')()).toBe(1);
      expect(compileExpression('-4 + 1')()).toBe(-3);
    });

    it('parses exponent notation', () => {
      expect(compileExpression('1e3')()).toBe(1000);
      expect(compileExpression('2.5E-3')()).toBe(0.0025);
      expect(compileExpression('1e+2 + 1')()).toBe(101);
      // A bare `e` after a number is not an exponent, so it stays a separate
      // identifier token and the expression is rejected as trailing input.
      expect(() => compileExpression('1 e')).toThrow(ExpressionSyntaxError);
    });

    it('rejects malformed numbers', () => {
      expect(() => compileExpression('1.2.3')).toThrow(/Invalid number/);
    });

    it('evaluates comparisons and logic', () => {
      expect(compileExpression('1 < 2 && 3 >= 3')()).toBe(true);
      expect(compileExpression('1 == 1 || false')()).toBe(true);
      expect(compileExpression('!true')()).toBe(false);
      expect(compileExpression("'a' != 'b'")()).toBe(true);
    });

    it('has one equality: === and !== are compile errors', () => {
      expect(() => compileExpression('1 === 1')).toThrow(
        /'===' is not allowed; use '=='/
      );
      expect(() => compileExpression('1 !== 1')).toThrow(
        /'!==' is not allowed/
      );
      expect(compileExpression("'2' == 2")()).toBe(true);
    });

    it('gives + the type of its left operand: text joins, a number adds', () => {
      const run = (source: string, scope = {}) =>
        compileExpression(source)(scope);
      expect(run("'2' + 3")).toBe('23');
      expect(run("3 + '2'")).toBe(5);
      expect(run("0 + '2' + 3")).toBe(5);
      // '' is text on the left, and no value on the right joins as ''.
      expect(
        run("'' + Rows + 'x' + Columns", { Rows: 512, Columns: 256 })
      ).toBe('512x256');
      expect(run("'b=' + B")).toBe('b=');
      // A missing left operand stays no value, so arithmetic on it does too.
      expect(run('B + 5')).toBeUndefined();
      expect(run("'' + B + 5")).toBe('5');
      expect(run('5 + B')).toBeUndefined();
    });

    it('warns for a number plus text, and rejects text in - * / %', () => {
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      expect(compileExpression("Rows + 'x'")({ Rows: 512 })).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
      expect(() => compileExpression("Rows - 'x'")).toThrow(/'-'.*'x'/);
      expect(() => compileExpression('Rows * `x`')).toThrow(
        /a template literal is not a number/
      );
    });

    it('gives the literal tests the DICOM kinds of a value', () => {
      const tests = [
        'X == undefined',
        'X == null',
        'X == defined',
        'X != undefined',
      ].map((source) => compileExpression(source));
      const row = (X: unknown) => tests.map((test) => test({ X }));
      expect(row(undefined)).toEqual([true, true, false, false]);
      expect(row(null)).toEqual([false, true, false, true]);
      expect(row('')).toEqual([false, true, false, true]);
      expect(row([])).toEqual([false, true, false, true]);
      expect(row([''])).toEqual([false, true, false, true]);
      expect(row([null])).toEqual([false, true, false, true]);
      expect(row('CT')).toEqual([false, false, true, true]);
      expect(compileExpression('X != defined')({ X: '' })).toBe(true);
    });

    it('compares two values with no value by kind: null is not undefined', () => {
      const equal = compileExpression('Y == Z');
      expect(equal({ Y: null })).toBe(false);
      expect(equal({ Z: null })).toBe(false);
      expect(equal({ Y: null, Z: '' })).toBe(false);
      expect(equal({ Y: null, Z: null })).toBe(true);
      expect(equal({})).toBe(true);
    });

    it('accepts defined only as an operand of == and !=', () => {
      expect(() => compileExpression('defined')).toThrow(
        /'defined' is a literal/
      );
      expect(() => compileExpression('defined(X)')).toThrow(
        ExpressionSyntaxError
      );
    });

    it('gives false for an ordering comparison with no value, and reads a numeric string as a number', () => {
      const greater = compileExpression('X > 1');
      expect([undefined, null, '', [], 'a'].map((X) => greater({ X }))).toEqual(
        [false, false, false, false, false]
      );
      expect(greater({ X: '2' })).toBe(true);
      expect(compileExpression('X <= 0')({ X: null })).toBe(false);
    });

    it('compares text without case with lower()', () => {
      const fn = compileExpression("lower(BodyPartExamined) == 'breast'");
      expect(fn({ BodyPartExamined: 'BREAST' })).toBe(true);
      expect(fn({})).toBe(false);
    });

    it('evaluates ternaries', () => {
      expect(compileExpression('1 < 2 ? "yes" : "no"')()).toBe('yes');
    });

    it('evaluates membership with in', () => {
      const fn = compileExpression("Modality in ['CR', 'DX', 'MG']");
      expect(fn({ Modality: 'MG' })).toBe(true);
      expect(fn({ Modality: 'CT' })).toBe(false);
    });

    it('reads == between a scalar and an array as equal only for one element, and between two arrays as equal in order', () => {
      const tests = [
        "X == ['MR', 'CT']",
        "['MR', 'CT'] == X",
        "X != ['MR', 'CT']",
        "X in ['MR', 'CT']",
      ].map((source) => compileExpression(source));
      const row = (X: unknown) => tests.map((test) => test({ X }));
      // A single value is not equal to a list of two; `in` tests membership.
      expect(row('MR')).toEqual([false, false, true, true]);
      expect(row('PT')).toEqual([false, false, true, false]);
      expect(row(undefined)).toEqual([false, false, true, false]);
      // Two arrays: the same elements, in the same order.
      expect(row(['MR', 'CT'])).toEqual([true, true, false, true]);
      expect(row(['CT', 'MR'])).toEqual([false, false, true, true]);
      // A single value equals an array of one element.
      expect(compileExpression("X == ['MR']")({ X: 'MR' })).toBe(true);
      expect(compileExpression("X == 'MR'")({ X: ['MR'] })).toBe(true);
      // A multi-valued value against a scalar is not equal; use in.
      expect(
        compileExpression("X == 'LOCALIZER'")({ X: ['ORIGINAL', 'LOCALIZER'] })
      ).toBe(false);
      expect(
        compileExpression("'LOCALIZER' in X")({ X: ['ORIGINAL', 'LOCALIZER'] })
      ).toBe(true);
      expect(compileExpression("['mr'] == ['mr', 'ct']")()).toBe(false);
    });

    it('refuses an empty array literal next to ==', () => {
      expect(() => compileExpression('X != []')).toThrow(/accepts no value/);
    });
  });

  describe('scope resolution', () => {
    it('resolves bare identifiers against the first argument', () => {
      const fn = compileExpression("Modality == 'CT' && Rows > 0");
      expect(fn({ Modality: 'CT', Rows: 512 })).toBe(true);
      expect(fn({ Modality: 'MR', Rows: 512 })).toBe(false);
    });

    it('resolves named parameters', () => {
      const fn = compileExpression('context.series.mixedBValue');
      expect(fn({}, { series: { mixedBValue: true } })).toBe(true);
    });

    it('supports custom parameter names', () => {
      const fn = compileExpression('items.length', { params: ['items'] });
      expect(fn([1, 2, 3])).toBe(3);
      const fn2 = compileExpression('instances.length');
      expect(fn2({ instances: [1, 2, 3] })).toBe(3);
    });

    it('reads the implicit scope from a named parameter', () => {
      const fn = compileExpression('SliceLocation', {
        params: ['a', 'b'],
        implicitScope: 'b',
      });
      expect(fn({ SliceLocation: 1 }, { SliceLocation: 2 })).toBe(2);
      expect(() =>
        compileExpression('x', { params: ['a'], implicitScope: 'c' })
      ).toThrow(/implicitScope 'c' is not one of the parameters \(a\)/);
    });

    it('refuses a bare identifier that is not a parameter with no implicit scope', () => {
      const options = { params: ['a', 'b', 'context'], implicitScope: false };
      const fn = compileExpression(
        'a.SliceLocation - b.SliceLocation',
        options
      );
      expect(fn({ SliceLocation: 5 }, { SliceLocation: 2 })).toBe(3);
      expect(() =>
        compileExpression('SliceLocation - b.SliceLocation', options)
      ).toThrow(ExpressionSyntaxError);
      expect(() =>
        compileExpression('SliceLocation - b.SliceLocation', options)
      ).toThrow(/'SliceLocation' is not a parameter.*\(a, b, context\)/);
      // Index expressions and template parts are checked too.
      expect(() => compileExpression('a[Key]', options)).toThrow(/'Key'/);
      expect(() => compileExpression('`${Name}`', options)).toThrow(/'Name'/);
    });

    it('lets an aggregate argument read the element with no implicit scope', () => {
      const fn = compileExpression('series.instances.count(Rows > 1)', {
        params: ['items'],
        implicitScope: false,
        receivers: { series: 'items' },
      });
      expect(fn([{ Rows: 2 }, { Rows: 0 }])).toBe(1);
      // Outside an aggregate, a bare name is still checked.
      expect(() =>
        compileExpression('Rows + series.instances.count()', {
          params: ['items'],
          implicitScope: false,
          receivers: { series: 'items' },
        })
      ).toThrow(/'Rows' is not a parameter/);
    });

    it('returns undefined for unknown identifiers (sparse tags)', () => {
      const fn = compileExpression('DiffusionBValue != undefined');
      expect(fn({})).toBe(false);
      expect(fn({ DiffusionBValue: 800 })).toBe(true);
    });
  });

  describe('template literals', () => {
    it('builds strings with interpolations', () => {
      const fn = compileExpression('`${SeriesDescription} #${InstanceNumber}`');
      expect(fn({ SeriesDescription: 'AX T1', InstanceNumber: 3 })).toBe(
        'AX T1 #3'
      );
    });

    it('renders null/undefined interpolations as empty strings', () => {
      const fn = compileExpression('`SCOUT ${SeriesDescription}`');
      expect(fn({})).toBe('SCOUT ');
    });
  });

  describe('helpers and aggregates', () => {
    it('gives includes, contains, startsWith and endsWith the meaning of the operators', () => {
      const run = (source: string, ImageType: unknown) =>
        compileExpression(source)({ ImageType });
      // includes tests whole elements; contains tests text.
      expect(run("includes(ImageType, 'M')", 'MR')).toBe(false);
      expect(
        run("includes(ImageType, 'LOCALIZER')", ['ORIGINAL', 'LOCALIZER'])
      ).toBe(true);
      expect(
        run("contains(ImageType, 'LOCAL')", ['ORIGINAL', 'LOCALIZER'])
      ).toBe(true);
      expect(
        run("startsWith(ImageType, 'ORIG')", ['ORIGINAL', 'PRIMARY'])
      ).toBe(true);
      expect(run("endsWith(ImageType, 'ARY')", ['ORIGINAL', 'PRIMARY'])).toBe(
        true
      );
      expect(run('ImageType == defined', [''])).toBe(false);
    });

    it('reads no value as undefined in arithmetic, and a numeric string as a number', () => {
      const run = (source: string, A: unknown) =>
        compileExpression(source)({ A });
      expect(run('A - 1', '3')).toBe(2);
      expect(run('Number(A) + 1', '2')).toBe(3);
      expect(run('A * 512', null)).toBeUndefined();
      expect(run('A - 1', '')).toBeUndefined();
      expect(run('-A', undefined)).toBeUndefined();
    });

    it('reads no value as false in !, && and ||, and gives a boolean', () => {
      const run = (source: string, A: unknown) =>
        compileExpression(source)({ A });
      expect(run('!A', [])).toBe(true);
      expect(run('A && A > 1000', undefined)).toBe(false);
      expect(run("A || 'x'", 'y')).toBe(true);
    });

    it('returns undefined for min/max with no number, and skips a missing value', () => {
      // Math.min()/Math.max() would answer ∓Infinity and poison a comparison.
      expect(compileExpression('min()')()).toBeUndefined();
      expect(compileExpression('max(undefined, null)')()).toBeUndefined();
      expect(compileExpression('min(3, 1, 2)')()).toBe(1);
      expect(compileExpression('max(3, null, 2)')()).toBe(3);
      expect(compileExpression('round(x)')({})).toBeUndefined();
    });

    it('runs min, max, sum and count over the list of the receiver', () => {
      const over = { params: ['list'], receivers: { series: 'list' } };
      const list = [
        { DiffusionBValue: 800, NumberOfFrames: '2' },
        { DiffusionBValue: null },
        { DiffusionBValue: 0, NumberOfFrames: 4 },
      ];
      const run = (source: string) =>
        compileExpression(`series.instances.${source}`, over)(list);
      expect(run('count()')).toBe(3);
      expect(run('count(DiffusionBValue)')).toBe(2);
      expect(run('count(DiffusionBValue > 100)')).toBe(1);
      expect(run('sum(NumberOfFrames)')).toBe(6);
      expect(run('min(DiffusionBValue)')).toBe(0);
      expect(run('max(NumberOfFrames)')).toBe(4);
      expect(compileExpression('series.instances.sum(x)', over)([])).toBe(0);
      expect(
        compileExpression('series.instances.max(x)', over)([])
      ).toBeUndefined();
    });

    it('refuses an aggregate inside the argument of an aggregate', () => {
      const over = { params: ['list'], receivers: { series: 'list' } };
      expect(() =>
        compileExpression(
          'series.instances.max(Rows - series.instances.min(Rows))',
          over
        )
      ).toThrow(/own context entry/);
    });
  });

  describe('safety', () => {
    it('rejects prototype-chain access at parse time', () => {
      expect(() => compileExpression('a.__proto__')).toThrow(
        ExpressionSyntaxError
      );
      expect(() => compileExpression('a.constructor')).toThrow(
        ExpressionSyntaxError
      );
      expect(() => compileExpression('a.prototype.x')).toThrow(
        ExpressionSyntaxError
      );
      expect(() => compileExpression('__proto__')).toThrow(
        ExpressionSyntaxError
      );
    });

    it('blocks computed prototype access at runtime', () => {
      // The key comes from the data, so only the runtime can see it.
      const fn = compileExpression('a[key]');
      expect(fn({ a: {}, key: 'constructor' })).toBeUndefined();
    });

    it('rejects non-whitelisted calls at compile time', () => {
      expect(() => compileExpression('alert(1)')).toThrow(
        ExpressionSyntaxError
      );
      expect(() => compileExpression('a.toString()')).toThrow(
        ExpressionSyntaxError
      );
    });

    it('rejects malformed expressions with the source in the message', () => {
      expect(() => compileExpression('1 +')).toThrow(/1 \+/);
      expect(() => compileExpression('`unterminated')).toThrow(
        ExpressionSyntaxError
      );
    });

    it('resolves null/undefined property access in templates to an empty string without throwing', () => {
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      try {
        // Accessing `a.b.c` when `a` is undefined must NOT throw; `safeGet`
        // handles the null chain gracefully and the template renders as ''.
        const fn = compileExpression('`${a.b.c}`');
        expect(fn({})).toBe('');
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('collectIdentifiers', () => {
    const identifiersOf = (source: string) =>
      collectIdentifiers(parseExpressionSource(source)).sort();

    it('collects the identifiers an expression resolves against its scope', () => {
      expect(identifiersOf("Modality == 'CT' && Rows > 512")).toEqual([
        'Modality',
        'Rows',
      ]);
    });

    it('collects only the root of a member or index chain', () => {
      // `ViewCodeSequence` and `CodeValue` are field reads off whatever
      // `instance` is, not scope lookups, so they are not identifiers.
      expect(identifiersOf('instance.ViewCodeSequence[0].CodeValue')).toEqual([
        'instance',
      ]);
      // The index expression IS evaluated in scope, so it is collected.
      expect(identifiersOf('instance.Sequence[Offset]')).toEqual([
        'Offset',
        'instance',
      ]);
    });

    it('does not collect helper or aggregate callees', () => {
      expect(identifiersOf('round(Rows / 64)')).toEqual(['Rows']);
      expect(identifiersOf('max(InstanceNumber)')).toEqual(['InstanceNumber']);
    });

    it('reaches into templates, ternaries and arrays', () => {
      expect(identifiersOf('`${SeriesDescription} ${Modality}`')).toEqual([
        'Modality',
        'SeriesDescription',
      ]);
      expect(identifiersOf('Rows > 2000 ? Big : Small')).toEqual([
        'Big',
        'Rows',
        'Small',
      ]);
      expect(identifiersOf("Modality in [Primary, 'CT']")).toEqual([
        'Modality',
        'Primary',
      ]);
    });

    it('reports the field of a path and the reads inside an aggregate', () => {
      expect(
        collectReads(
          parseExpressionSource(
            'round(sweepStart - timeClusters.first) + series.instances.max(Rows)'
          ),
          { aggregates: true }
        )
      ).toEqual([
        { name: 'sweepStart', inAggregate: false },
        { name: 'timeClusters', field: 'first', inAggregate: false },
        { name: 'Rows', inAggregate: true },
      ]);
    });

    it('lets a host spot an identifier it does not supply', () => {
      // What a host with a genuinely closed subject would do with this, rather
      // than the compiler doing it: the compiler is called from places that do
      // not know the subject's shape, and a naturalized instance's attributes
      // are not enumerable up front anyway.
      const supplied = new Set(['Modality', 'Rows', 'instance', 'context']);
      const unknown = identifiersOf("Modallity == 'CT' && Rows > 0").filter(
        (name) => !supplied.has(name)
      );
      expect(unknown).toEqual(['Modallity']);
    });
  });
});
