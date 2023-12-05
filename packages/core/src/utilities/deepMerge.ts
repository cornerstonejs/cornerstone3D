const isMergeableObject = (val) => {
  const nonNullObject = val && typeof val === 'object';

  return (
    nonNullObject &&
    Object.prototype.toString.call(val) !== '[object RegExp]' &&
    Object.prototype.toString.call(val) !== '[object Date]'
  );
};

const emptyTarget = (val) => {
  const isEmpty = Array.isArray(val) ? [] : {};

  return isEmpty;
};

const cloneIfNecessary = (value, optionsArgument) => {
  const clone = optionsArgument && optionsArgument.clone === true;

  return clone && isMergeableObject(value)
    ? deepMerge(emptyTarget(value), value, optionsArgument)
    : value;
};

const defaultArrayMerge = (target, source, optionsArgument) => {
  const destination = target.slice();

  source.forEach(function (e, i) {
    if (typeof destination[i] === 'undefined') {
      destination[i] = cloneIfNecessary(e, optionsArgument);
    } else if (isMergeableObject(e)) {
      destination[i] = deepMerge(target[i], e, optionsArgument);
    } else if (target.indexOf(e) === -1) {
      // IMPORTANT: WE SHOULD NOT PUSH NEW ELEMENTS TO THE ARRAY
      // INSTEAD WE SHOULD REPLACE THE ELEMENT, this will result
      // in unexpected behaviors if the initial tool parameters
      // are desired to override the default tool parameters that are
      // arrays
      destination[i] = cloneIfNecessary(e, optionsArgument);
    }
  });

  return destination;
};

const mergeObject = (target, source, optionsArgument) => {
  const destination = {};

  if (isMergeableObject(target)) {
    Object.keys(target).forEach(function (key) {
      destination[key] = cloneIfNecessary(target[key], optionsArgument);
    });
  }
  Object.keys(source).forEach(function (key) {
    if (!isMergeableObject(source[key]) || !target[key]) {
      destination[key] = cloneIfNecessary(source[key], optionsArgument);
    } else {
      destination[key] = deepMerge(target[key], source[key], optionsArgument);
    }
  });

  return destination;
};

/**
 * Merge two objects, recursively merging any objects that are arrays
 * @param target - The target object.
 * @param source - The source object to merge into the target object.
 * @param optionsArgument - The options object.
 * @returns The merged object.
 */
const deepMerge = (target = {}, source = {}, optionsArgument = undefined) => {
  const array = Array.isArray(source);
  const options = optionsArgument || { arrayMerge: defaultArrayMerge };
  const arrayMerge = options.arrayMerge || defaultArrayMerge;

  if (array) {
    return Array.isArray(target)
      ? arrayMerge(target, source, optionsArgument)
      : cloneIfNecessary(source, optionsArgument);
  }

  return mergeObject(target, source, optionsArgument);
};

export default deepMerge;
