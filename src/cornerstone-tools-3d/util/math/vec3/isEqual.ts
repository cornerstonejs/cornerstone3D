const tolerance = 1e-5;

export default function isEqual(v1, v2) {
  return (
    Math.abs(v1[0] - v2[0]) < tolerance &&
    Math.abs(v1[1] - v2[1]) < tolerance &&
    Math.abs(v1[2] - v2[2]) < tolerance
  );
}
