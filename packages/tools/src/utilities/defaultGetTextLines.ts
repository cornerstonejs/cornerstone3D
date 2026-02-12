import { utilities as csUtils } from '@cornerstonejs/core';

const { isEqual } = csUtils;

export interface MetricDefinition {
  name: string;
  attribute: string;
  unitAttribute: string;
}

export const AREA_METRICS: MetricDefinition[] = [
  { name: 'Area', attribute: 'area', unitAttribute: 'areaUnit' },
  { name: 'Mean', attribute: 'mean', unitAttribute: 'modalityUnit' },
  { name: 'Max', attribute: 'max', unitAttribute: 'modalityUnit' },
  { name: 'Min', attribute: 'min', unitAttribute: 'modalityUnit' },
  { name: 'Std Dev', attribute: 'stdDev', unitAttribute: 'modalityUnit' },
];

/**
 * Creates a function that returns text lines for the specified metrics in the given ordering.
 *
 * @param metrics - Array of metric definitions specifying name, attribute, and unitAttribute
 * @returns A function that processes annotation data and returns text lines
 */
export function createGetTextLines(
  metrics: MetricDefinition[]
): (data, targetId: string | string[]) => string[] {
  return function (data, targetId: string | string[]): string[] {
    const targetIds = Array.isArray(targetId) ? targetId : [targetId];
    const cachedVolumeStats = targetIds
      .map((id) => data.cachedStats[id])
      .filter((it) => it?.mean !== undefined && it?.mean !== null);

    if (!cachedVolumeStats.length) {
      return;
    }

    const textLines: string[] = [];

    for (const metric of metrics) {
      pushResult(
        textLines,
        createMultiResultLine(
          cachedVolumeStats,
          targetIds,
          metric.name,
          metric.attribute,
          metric.unitAttribute
        )
      );
    }

    return textLines;
  };
}

/**
 * _getTextLines - Returns the Area, mean and std deviation of the area of the
 * target volume enclosed by the rectangle.
 *
 * @param data - The annotation tool-specific data.
 * @param targetId - The volumeId of the volume to display the stats for.
 */
export const defaultAreaGetTextLines = createGetTextLines(AREA_METRICS);

function pushResult(textLines: string[], value: string) {
  if (value) {
    textLines.push(value);
  }
}

/**
 * Creates a formatted multi-result line string for a given metric across multiple target volumes.
 *
 * Formats the result as "Name: value1 unit1 value2 unit2 ..." where each value-unit pair
 * corresponds to a different target volume. Only includes values that are valid numbers.
 *
 * @param cachedVolumeStats - Object containing cached statistics for each target volume,
 *                            keyed by target ID
 * @param targetIds - Array of target volume IDs to include in the result
 * @param name - Display name for the metric (e.g., "Area", "Mean", "Max")
 * @param attribute - The attribute name to read from the stats object (e.g., "area", "mean", "max")
 * @param unitAttribute - The attribute name containing the unit for this metric
 *                       (e.g., "areaUnit", "modalityUnit")
 * @returns A formatted string like "Name: value1 unit1 value2 unit2", or undefined if
 *          no valid numeric values are found for any target
 */
export function createMultiResultLine(
  cachedVolumeStats,
  targetIds: string[],
  name: string,
  attribute: string,
  unitAttribute: string
) {
  const result = [`${name}:`];
  let lastValue = null;
  let lastUnit = null;

  for (const stats of cachedVolumeStats) {
    if (!csUtils.isNumber(stats?.[attribute])) {
      continue;
    }
    const attributeValue = stats[attribute];
    const unitValue = stats[unitAttribute];
    if (isEqual(lastValue, attributeValue) && lastUnit === unitValue) {
      continue;
    }
    result.push(`${csUtils.roundNumber(attributeValue)} ${unitValue}`);
    lastValue = attributeValue;
    lastUnit = unitValue;
  }
  if (result.length <= 1) {
    return;
  }
  return result.join(' ');
}
