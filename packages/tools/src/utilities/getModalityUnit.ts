function getModalityUnit(modality: string, isPreScaled: boolean): string {
  if (modality === 'CT') {
    return 'HU';
  } else if (modality === 'PT' && isPreScaled === true) {
    return 'SUV';
  } else {
    return '';
  }
}

export { getModalityUnit };
