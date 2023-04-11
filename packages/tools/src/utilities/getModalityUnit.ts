function getModalityUnit(
  modality: string,
  isPreScaled: boolean,
  isSuvScaled: boolean
): string {
  if (modality === 'CT') {
    return 'HU';
  } else if (
    modality === 'PT' &&
    isPreScaled === true &&
    isSuvScaled === true
  ) {
    return 'SUV';
  } else {
    return '';
  }
}

export { getModalityUnit };
