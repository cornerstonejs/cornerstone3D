/** Rounds the measurement value appropriately */
function roundMeasurement(value, scaling = 1) {
  if (value === undefined || value === null || value === '') return 'NaN';
  const scaleValue = value * scaling;
  if (scaleValue >= 100) return Math.round(scaleValue);
  if (scaleValue >= 10) return scaleValue.toFixed(1);
  if (scaleValue >= 0.1) return scaleValue.toFixed(2);
  if (scaleValue >= 0.001) return scaleValue.toFixed(4);
  if (scaleValue >= 0.00001) return scaleValue.toFixed(6);
  return scaleValue;
}

export default roundMeasurement;
