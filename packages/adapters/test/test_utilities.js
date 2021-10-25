const expect = require("chai").expect;
const dcmjs = require("../build/dcmjs");
const { utilities } = dcmjs;
const { addAccessors } = utilities;

exports.test = () => {
  const tests = {
    testAddAccessor: () => {
      const baseValue = { a: 1, b: 2 };
      const arrValue = [baseValue];
      addAccessors(arrValue, baseValue);
      expect(arrValue.a).to.equal(1);
      baseValue.a = 3;
      expect(arrValue.a).to.equal(3);
      arrValue.b = 4;
      expect(baseValue.b).to.equal(4);
      const forArr = [];
      arrValue.forEach(item => forArr.push(item));
      expect(forArr.length).to.equal(1);
    },
  };

  Object.keys(tests).forEach(testKey => {
    console.log('Running', testKey);
    const test = tests[testKey];
    test();
    console.log('Done running', testKey);
  });
}

