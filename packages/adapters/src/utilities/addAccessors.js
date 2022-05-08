const handler = {
    get: function(target, prop) {
        if (prop in target) return target[prop];
        return target[0][prop];
    },

    set: function(obj, prop, value) {
        if (typeof prop === "number") {
            obj[prop] = value;
        } else if (prop in obj) {
            obj[prop] = value;
        } else {
            obj[0][prop] = value;
        }
        return true;
    }
};

/**
 * Proxy to dest as an array
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
const addAccessors = (dest, sqZero) => {
    const ret = [sqZero];
    return new Proxy(ret, handler);
};

export default addAccessors;
