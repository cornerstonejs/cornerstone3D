import Settings from '../src/Settings.js';

describe('Settings', () => {
  it('should support setting properties', () => {
    const settings = new Settings();
    expect(settings.set('a.b', 'a')).toBe(true);
    expect(settings.get('a.b')).toBe('a');
    expect(settings.set('a.b.c', 'b')).toBe(true);
    expect(settings.get('a.b.c')).toBe('b');
  });

  it('should reject setting malformed properties', () => {
    const settings = new Settings();
    expect(settings.set('.a.b.c', 'a')).toBe(false);
    expect(settings.get('.a.b.c')).toBeUndefined();
    expect(settings.set('a..b.c', 'b')).toBe(false);
    expect(settings.get('a..b.c')).toBeUndefined();
  });

  it('should support extension of settings', () => {
    const a = new Settings();
    const b = new Settings(a);
    const c = new Settings(b);
    // "b" and "c" should reflect changes from "a" since there is no override
    expect(a.set('a.b.c', 'a')).toBe(true);
    expect(a.get('a.b.c')).toBe('a');
    expect(b.get('a.b.c')).toBe('a');
    expect(c.get('a.b.c')).toBe('a');
    // changing "a" will reflect on "b"
    expect(a.set('a.b.c', 'x')).toBe(true);
    expect(a.get('a.b.c')).toBe('x');
    expect(b.get('a.b.c')).toBe('x');
    expect(c.get('a.b.c')).toBe('x');
    // overriding property in "b" will affect "b" and "c" but not "a"
    expect(b.set('a.b.c', 'y')).toBe(true);
    expect(a.get('a.b.c')).toBe('x');
    expect(b.get('a.b.c')).toBe('y');
    expect(c.get('a.b.c')).toBe('y');
    // overriding property in "c" will affect only "c"
    expect(c.set('a.b.c', 'z')).toBe(true);
    expect(a.get('a.b.c')).toBe('x');
    expect(b.get('a.b.c')).toBe('y');
    expect(c.get('a.b.c')).toBe('z');
  });

  it('should support setting multiple properties', () => {
    const settings = new Settings();
    expect(
      settings.set('a.b', {
        c: 'C',
        d: {
          '': 'Oops!',
          e: 'E',
          f: 'F',
        },
      })
    ).toBe(true);
    expect(settings.get('a.b.c')).toBe('C');
    expect(settings.get('a.b.d')).toBe('Oops!');
    expect(settings.get('a.b.d.e')).toBe('E');
    expect(settings.get('a.b.d.f')).toBe('F');
  });

  it('should support iteration over properties', () => {
    const settings = new Settings();
    expect(
      settings.set('a.b', {
        c: 'C',
        d: {
          '': 'Oops!',
          e: 'E',
          f: 'F',
        },
      })
    ).toBe(true);
    const keys = ['a.b.c', 'a.b.d', 'a.b.d.e', 'a.b.d.f'];
    const count = [0, 0, 0, 0];
    settings.forEach((key) => {
      const index = keys.indexOf(key);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(++count[index]).toBe(1);
    });
    expect(count).toEqual([1, 1, 1, 1]);
  });

  it('should support unset of properties', () => {
    const settings = new Settings();
    const keys = [];
    expect(
      settings.set('a.b', {
        c: 'C',
        d: {
          '': 'Oops!',
          e: 'E',
          f: 'F',
        },
        x: 3,
        y: 4,
        z: 5,
      })
    ).toBe(true);
    expect(settings.get('a.b.c')).toBe('C');
    expect(settings.get('a.b.d')).toBe('Oops!');
    expect(settings.get('a.b.d.e')).toBe('E');
    expect(settings.get('a.b.d.f')).toBe('F');
    expect(settings.get('a.b.x')).toBe(3);
    expect(settings.get('a.b.y')).toBe(4);
    expect(settings.get('a.b.z')).toBe(5);
    keys.length = 0;
    settings.forEach((key) => keys.push(key));
    expect(keys.length).toBe(7);
    // remove all "a.b.d.*" namespace
    expect(settings.unset('a.b.d.')).toBe(true);
    expect(settings.get('a.b.c')).toBe('C');
    expect(settings.get('a.b.d')).toBeUndefined();
    expect(settings.get('a.b.d.e')).toBeUndefined();
    expect(settings.get('a.b.d.f')).toBeUndefined();
    expect(settings.get('a.b.x')).toBe(3);
    expect(settings.get('a.b.y')).toBe(4);
    expect(settings.get('a.b.z')).toBe(5);
    keys.length = 0;
    settings.forEach((key) => keys.push(key));
    expect(keys.length).toBe(4);
    // remove all remaining items
    expect(settings.unset('.')).toBe(true);
    expect(settings.get('a.b.c')).toBeUndefined();
    expect(settings.get('a.b.d')).toBeUndefined();
    expect(settings.get('a.b.d.e')).toBeUndefined();
    expect(settings.get('a.b.d.f')).toBeUndefined();
    expect(settings.get('a.b.x')).toBeUndefined();
    expect(settings.get('a.b.y')).toBeUndefined();
    expect(settings.get('a.b.z')).toBeUndefined();
    keys.length = 0;
    settings.forEach((key) => keys.push(key));
    expect(keys.length).toBe(0);
  });

  it('should prevent circular references', () => {
    const settings = new Settings();
    const x = { name: 'X' };
    const a = { name: 'A', ref: null };
    const b = {
      name: 'B',
      c: {
        name: 'C',
        a,
        x,
        xx: x,
        xxx: x,
      },
    };
    // set circular reference
    a.ref = b;
    expect(settings.set('b', b)).toBe(true);
    expect(settings.get('b.name')).toBe('B');
    expect(settings.get('b.c.name')).toBe('C');
    expect(settings.get('b.c.a.name')).toBe('A');
    expect(settings.get('b.c.a.ref')).toBe(null);
    expect(settings.get('b.c.x.name')).toBe('X');
    expect(settings.get('b.c.xx.name')).toBe('X');
    expect(settings.get('b.c.xxx.name')).toBe('X');
    const keys = [];
    settings.forEach((key) => keys.push(key));
    expect(keys.length).toBe(7);
  });

  it('should support import and export (dump) features', () => {
    const settings = new Settings();
    const source = {
      my: {
        awesome: {
          property: true,
        },
        yet: {
          even: {
            more: {
              awesome: {
                property: 'Love is all around you!',
                nothing: {
                  '': 1048576,
                  name: '2^20',
                },
              },
            },
          },
        },
      },
    };
    settings.import(source);
    expect(settings.get('my.yet.even.more.awesome.nothing')).toBe(1048576);
    expect(settings.get('my.yet.even.more.awesome.nothing.name')).toBe('2^20');
    expect(JSON.stringify(settings.dump())).toBe(JSON.stringify(source));
  });
});
