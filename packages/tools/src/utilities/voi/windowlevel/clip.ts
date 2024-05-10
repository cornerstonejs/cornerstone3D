function clip(val, low, high) {
  return Math.min(Math.max(low, val), high);
}

export { clip };
