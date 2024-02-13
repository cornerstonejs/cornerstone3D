/**
 * easeInOutBell animation
 *
 * @param x – Represents the progression of the animation over time.
 * Its value typically ranges from 0 to 1, where 0 denotes the start
 * of the animation and 1 denotes the end. In scenarios where the animation is meant to loop infinitely,
 * x can go beyond the range of 0 to 1, and it is normalized within the
 * function to wrap around, ensuring the animation loops smoothly.
 *
 * @param baseline – Determines the starting point or the minimum value of the animation curve.
 * It's used to offset the animation vertically. This means if you have an animation that
 * oscillates around a certain value, the baseline shifts this oscillation up or down.
 * The purpose of the baseline is to allow the animation to not only vary in its
 * intensity or "height" (how far it goes from the baseline) but also to start from
 * a non-zero point if desired.
 */

export default function easeInOutBell(x: number, baseline: number): number {
  const alpha = 1 - baseline;

  // Normalize x to a 0-1 range for a repeating cycle
  x = x % 1;

  // The function is divided into four segments based on the value of 'x',
  // creating a smooth bell curve animation.
  // Each segment of the curve is defined for a quarter of the animation
  // duration (0-1/4, 1/4-1/2, 1/2-3/4, 3/4-1).
  // 'alpha' scales the height of the curve, and 'baseline' sets the starting point of the curve.
  // The use of Math.pow creates the easing effect by accelerating the animation speed towards
  // the middle of the curve and decelerating towards the ends.

  if (x < 1 / 4) {
    // First segment: accelerates from the baseline
    return 4 * Math.pow(2 * x, 3) * alpha + baseline;
  } else if (x < 1 / 2) {
    // Second segment: decelerates to the peak
    return (1 - Math.pow(-4 * x + 2, 3) / 2) * alpha + baseline;
  } else if (x < 3 / 4) {
    // Third segment: accelerates from the peak downwards
    return (1 - Math.pow(4 * x - 2, 3) / 2) * alpha + baseline;
  } else {
    // Fourth segment: decelerates back to the baseline
    return -4 * Math.pow(2 * x - 2, 3) * alpha + baseline;
  }
}
