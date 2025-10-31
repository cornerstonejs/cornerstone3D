import { utilities } from '@cornerstonejs/core';

const { toNumber } = utilities;

export function singleMetadata(metadata, options?) {
  const value = metadata[this.tag];
  const index = options?.index ?? this.index ?? 0;
  if (index === -1) {
    return value?.Value;
  }
  return value?.Value?.[index];
}

export function arrayMetadata(metadata, options) {
  const value = metadata[this.tag];
  const index = options?.index ?? this.index ?? -1;
  if (index === -1) {
    return value?.Value;
  }
  return value?.Value?.[index];
}

export function numberMetadata(metadata, index = 0) {
  return toNumber(this.singleMetadata(metadata, index));
}

export function singleNatural<T>(metadata, index = 0) {
  const value = metadata[this.lowerName];
  return (Array.isArray(value) ? value[index] : value) as T;
}

export function arrayNatural<T>(natural) {
  const value = natural[this.lowerName];
  if (Array.isArray(value) || value === null || value === undefined) {
    return value;
  }
  return [value];
}

export function numberNatural(metadata, index = 0) {
  return toNumber(this.singleMetadata(metadata, index));
}

export function sqNatural(natural, options?) {
  const sequence = natural[this.tag]?.Value;
  if (!Array.isArray(sequence)) {
    return;
  }
  return sequence.map((sq) =>
    this.moduleStatic.createSqNatural(this, sq, options)
  );
}

export function sqMetadata(metadata, options?) {
  const sequence = metadata[this.tag]?.Value;
  if (!Array.isArray(sequence)) {
    return;
  }
  return sequence.map((sq) =>
    this.moduleStatic.createSqMetadata(this, sq, options)
  );
}
