export function pointToString(point, decimals = 5) {
  return (
    parseFloat(point[0]).toFixed(decimals) +
    ',' +
    parseFloat(point[1]).toFixed(decimals) +
    ',' +
    parseFloat(point[2]).toFixed(decimals) +
    ','
  );
}
