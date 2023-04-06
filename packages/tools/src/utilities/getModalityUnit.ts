function getModalityUnit(
  modality: string,
  isPreScaled: boolean,
  suvbw?: number
): string {
  if (modality === 'CT') {
    return 'HU';
  } else if (
    modality === 'PT' &&
    isPreScaled === true &&
    typeof suvbw === 'number'
  ) {
    return 'SUV';
  } else {
    return '';
  }
}

export { getModalityUnit };
