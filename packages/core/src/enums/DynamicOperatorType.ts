/**
 * DynamicOperatorType enum for cornerstone-render which defines the operator to use for generateImageFromTimeData.
 * It can be either SUM, AVERAGE or SUBTRACT.
 */
enum DynamicOperatorType {
  /** For summing the time frames. */
  SUM = 'SUM',
  /** For averaging the time frames. */
  AVERAGE = 'AVERAGE',
  /** For subtracting two time frames */
  SUBTRACT = 'SUBTRACT',
}

export default DynamicOperatorType;
