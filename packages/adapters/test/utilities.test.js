import dcmjs from "../src/index.js";

const { utilities } = dcmjs;
const { addAccessors } = utilities;

describe("addAccessor", () => {
    it("testAddAccessor", () => {
        const baseValue = { a: 1, b: 2 };
        const arrValue = [baseValue];
        const val = addAccessors(arrValue);
        expect(val.a).toEqual(1);
        baseValue.a = 3;
        expect(val.a).toEqual(3);
        val.b = 4;
        expect(baseValue.b).toEqual(4);

        // Check that we can iterate as an array
        const forArr = [];
        val.forEach(item => forArr.push(item));
        expect(forArr.length).toEqual(1);
        expect(forArr[0]).toEqual(baseValue);
    });

    it("testAddAccessor-adds_children", () => {
        const baseValue = { a: 1, b: 2 };
        const arrValue = [baseValue];
        const val = addAccessors(arrValue, baseValue);
        val.push({ a: "two" });
        expect(val.length).toBe(2);
        expect(val[1].a).toBe("two");
        expect(val.a).toBe(1);
        expect(val[0].a).toBe(1);
    });

    it("Does not double proxy", () => {
        const baseValue = { a: 1, b: 2 };
        const arrValue = [baseValue];
        const val = addAccessors(arrValue, baseValue);
        expect(val).toEqual(addAccessors(val));
        expect(val.__isProxy).toBe(true);
    })

    it("Handles non-array dest with no sqzero", () => {
        const baseValue = { a: 1, b: 2 };
        expect(Array.isArray(addAccessors(baseValue))).toBe(true);
        expect(addAccessors("Hello")).toBe("Hello");
        expect(addAccessors([baseValue])[0]).toBe(baseValue);
        expect(addAccessors([baseValue, 2])[1]).toBe(2);
    })

});