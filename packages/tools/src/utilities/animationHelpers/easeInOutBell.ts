export default function easeInOutBell(x: number, baseline: number): number {
  const alpha = 1 - baseline;

  // prettier-ignore
  if (x < 1 / 4) {
        return  4 * Math.pow(2 * x, 3) * alpha + baseline;
    } else if (x < 1 / 2) {
        return (1 - Math.pow(-4 * x + 2, 3) / 2) * alpha + baseline;
    } else if (x < 3 / 4) {
        return (1 - Math.pow(4 * x - 2, 3) / 2) * alpha + baseline;
    } else {
        return (- 4 * Math.pow(2 * x - 2, 3)) * alpha + baseline;
    }
}
