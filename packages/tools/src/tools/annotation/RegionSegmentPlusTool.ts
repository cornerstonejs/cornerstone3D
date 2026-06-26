import RegionSegmentPlusFloodFillTool from './RegionSegmentPlusFloodFillTool';

/**
 * @deprecated Use {@link RegionSegmentPlusFloodFillTool} or {@link RegionSegmentPlusGrowCutTool}.
 *
 * Kept as a thin alias that preserves the legacy `RegionSegmentPlus` registration
 * name so existing tool-group/config references keep working.
 */
export default class RegionSegmentPlusTool extends RegionSegmentPlusFloodFillTool {
  static toolName = 'RegionSegmentPlus';
}
