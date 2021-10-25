/**
 * Adds accessors (set/get) to dest for every property in src.
 * @example
 * src = [{a:5,b:'string', c:null}]
 * addAccessors(src)
 * src.c = 'outerChange'
 * src[0].b='innerChange'
 *
 * assert src.a===5
 * assert src[0].c === 'outerChange'
 * assert src.b === 'innerChange'
 */
const addAccessors = (dest, src) => {
    Object.keys(src).forEach(key => {
        Object.defineProperty(dest, key, {
            get: () => {
                return src[key];
            },
            set: v => {
                src[key] = v;
            }
        });
    });
};

export default addAccessors;
