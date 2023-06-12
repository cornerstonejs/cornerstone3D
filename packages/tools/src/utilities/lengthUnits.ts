const lengthUnits = (handles, image): string => {
  const { calibration, hasPixelSpacing } = image;
  const units = hasPixelSpacing ? 'mm' : 'px';
  if (!calibration || !calibration.type) return units;
  if (calibration.SequenceOfUltrasoundRegions) return 'US Region';
  return `${units} ${calibration.type}`;
};

const areaUnits = (handles, image): string => {
  const { calibration, hasPixelSpacing } = image;
  const units = hasPixelSpacing ? 'mm\xb2' : 'px\xb2';
  if (!calibration || !calibration.type) return units;
  if (calibration.SequenceOfUltrasoundRegions) return 'US Region';
  return `${units} ${calibration.type}`;
};

export default lengthUnits;

export { areaUnits, lengthUnits };
