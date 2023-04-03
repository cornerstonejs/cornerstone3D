function getModalityUnit(modality: string, isPreScaled: boolean): string {
  if (modality === 'CT') {
    return 'HU';
  } else {
    return '';
  }
}

export { getModalityUnit };
