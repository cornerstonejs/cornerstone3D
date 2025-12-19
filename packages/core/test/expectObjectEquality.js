/**
 * Runs an expectation that every iterable key in actual is found in expected
 * with the same value, and every
 */
export function expectObjectEquality(
  actual,
  expected,
  ignoreActualUndefined = true
) {
  const differences = compareObject(actual, expected, ignoreActualUndefined);

  if (differences.length) {
    console.warn('Actual:', JSON.stringify(actual, null, 2));
    console.warn('Expected:', JSON.stringify(expected, null, 2));
  }
  expect(differences).toEqual([]);
}

export function compareObject(actual, expected, ignoreActualUndefined = true) {
  const differences = [];
  if (actual && !expected) {
    differences.push(`Expected is falsy ${expected} but actual is ${actual}`);
    return differences;
  }
  if (!actual && expected) {
    differences.push(
      `Actual is falsy ${actual} but expected is ${JSON.stringify(expected)}`
    );
    return differences;
  }
  if (actual === expected) {
    return differences;
  }
  if (expected && typeof expected.asymmetricMatch === 'function') {
    const result = expected.asymmetricMatch(actual);
    if (!result) {
      console.warn("actual doesen't match jasmine matcher:", actual, expected);
    }
    return differences;
  }

  const actualKeys = new Set(Object.keys(actual));
  for (const [key, value] of Object.entries(expected)) {
    actualKeys.delete(key);
    const actualValue = actual[key];
    if (value === actualValue) {
      continue;
    }
    if (typeof actualValue === 'object' && typeof value === 'object') {
      const childDifferences = compareObject(
        actualValue,
        value,
        ignoreActualUndefined
      );
      if (childDifferences.length) {
        console.warn(
          'Parent key',
          key,
          'has child differences',
          childDifferences
        );
        differences.push(...childDifferences);
      }
      continue;
    }
    console.warn('Expected', key, value, actualValue);
    differences.push(
      `Expected ${key} has value ${value} but actual has ${actualValue}`
    );
  }
  if (actualKeys.size) {
    for (const key of actualKeys.keys()) {
      const actualValue = actual[key];
      if (actualValue === undefined && ignoreActualUndefined) {
        continue;
      }
      differences.push(
        `Actual has ${key} with value ${actualValue} missing in expected`
      );
    }
  }
  return differences;
}
