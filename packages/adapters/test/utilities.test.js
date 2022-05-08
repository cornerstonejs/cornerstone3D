import dcmjs from '../src/index.js';

const { utilities } = dcmjs;
const { addAccessors } = utilities;

it("testAddAccessor", () => {
    const baseValue = { a: 1, b: 2 };
    const arrValue = [baseValue];
    const val = addAccessors(arrValue, baseValue);
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
