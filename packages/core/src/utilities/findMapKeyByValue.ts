function findMapKeyByValue(map, searchValue) {
  for (const [key, value] of map.entries()) {
    if (value === searchValue) {
      return key;
    }
  }
  return null;
}

export { findMapKeyByValue };
