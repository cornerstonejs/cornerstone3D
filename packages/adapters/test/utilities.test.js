import dcmjs from '../src/index.js';

const { utilities } = dcmjs;
const { addAccessors } = utilities;

it("testAddAccessor", () => {
    const baseValue = { a: 1, b: 2 };
    const arrValue = [baseValue];
    addAccessors(arrValue, baseValue);
    expect(arrValue.a).toEqual(1);
    baseValue.a = 3;
    expect(arrValue.a).toEqual(3);
    arrValue.b = 4;
    expect(baseValue.b).toEqual(4);
    const forArr = [];
    arrValue.forEach(item => forArr.push(item));
    expect(forArr.length).toEqual(1);
});
