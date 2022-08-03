function getModalityUnit(modality: string): string {
  if (modality === 'CT') {
    return 'HU';
  } else if (modality === 'PT') {
    return 'SUV';
  } else {
    return '';
  }
}

export { getModalityUnit };
