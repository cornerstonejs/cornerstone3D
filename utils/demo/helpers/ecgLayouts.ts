import { utilities, type TraceRegion } from '@cornerstonejs/core';

export type ECGLayoutType = string;

export interface ECGLayoutOption {
  id: string;
  name: string;
}

export const ecgLayouts = new Map<string, ECGLayoutOption>([
  ['12x1', { id: '12x1', name: '12x1 (Stacked)' }],
  ['6x2', { id: '6x2', name: '6x2' }],
  ['3x4', { id: '3x4', name: '3x4' }],
  ['3x4+1', { id: '3x4+1', name: '3x4 + 1 Rhythm' }],
]);

const { STANDARD_12_LEADS } = utilities.ECGUtilities;

/**
 * Generic layout preset generator for AABB2 percentage traceRegions.
 * Dynamically parses any `Rows x Cols` layout (e.g. '12x1', '6x2', '3x4', '5x3', '15x1')
 * and optional `+1` rhythm strip (e.g. '3x4+1', '6x2+1') into normalized 0.0 to 1.0 AABB2 boxes.
 *
 * @param layout - The layout specification string (e.g. '12x1', '6x2', '3x4', '3x4+1')
 * @param totalChannels - Total number of waveform channels (defaults to 12)
 * @returns Array of TraceRegion bounding boxes with lead indices
 */
export function createLayoutRegions(
  layout: ECGLayoutType,
  totalChannels = 12
): TraceRegion[] {
  const regions: TraceRegion[] = [];
  const hasRhythmStrip = layout.includes('+1');
  const baseLayout = layout.replace('+1', '');
  const [rowsStr, colsStr] = baseLayout.split('x');

  const rows = parseInt(rowsStr, 10) || totalChannels;
  const cols = parseInt(colsStr, 10) || 1;

  const topHeight = hasRhythmStrip ? 0.75 : 1.0;
  const rowHeight = topHeight / rows;
  const colWidth = 1.0 / cols;

  let channelIdx = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (channelIdx < totalChannels) {
        regions.push({
          id: STANDARD_12_LEADS[channelIdx] || `${channelIdx + 1}`,
          bounds: {
            minX: c * colWidth,
            maxX: (c + 1) * colWidth,
            minY: r * rowHeight,
            maxY: (r + 1) * rowHeight,
          },
          leadIndices: [channelIdx],
        });
        channelIdx++;
      }
    }
  }

  // If +1 rhythm strip requested, add continuous lead across bottom 25%
  if (hasRhythmStrip) {
    regions.push({
      id: 'II (Rhythm)',
      bounds: { minX: 0, maxX: 1, minY: topHeight, maxY: 1.0 },
      leadIndices: [1], // Standard Lead II rhythm strip
    });
  }

  return regions;
}

export default createLayoutRegions;
