import BrushStrategy from './BrushStrategy';
import compositions from './compositions';
import { createPointInEllipse } from './utils/createPointInEllipse';
import { initializeArea } from './utils/initializeArea';
import { initializeCircle } from './utils/initializeCircle';

const CIRCLE_STRATEGY = new BrushStrategy(
  'Circle',
  compositions.regionFill,
  compositions.setValue,
  initializeCircle,
  compositions.determineSegmentIndex,
  compositions.preview
);

const CIRCLE_THRESHOLD_STRATEGY = new BrushStrategy(
  'CircleThreshold',
  compositions.regionFill,
  compositions.setValue,
  initializeCircle,
  compositions.determineSegmentIndex,
  compositions.dynamicThreshold,
  compositions.threshold,
  compositions.preview,
  compositions.islandRemoval
);

const AREA_THRESHOLD_STRATEGY = new BrushStrategy(
  'AreaThreshold',
  compositions.areaFill,
  compositions.setValue,
  initializeArea,
  compositions.determineSegmentIndex,
  compositions.dynamicThreshold,
  compositions.threshold,
  compositions.preview,
  compositions.islandRemoval
);

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
const fillInsideCircle = CIRCLE_STRATEGY.strategyFunction;

/**
 * Fill inside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
const thresholdInsideCircle = CIRCLE_THRESHOLD_STRATEGY.strategyFunction;

/**
 * Fill segment inside the area inside the segmentation defined by the operationData.
 * It fills the segmentation pixels inside the viewport area.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
const thresholdInsideArea = AREA_THRESHOLD_STRATEGY.strategyFunction;
/**
 * Fill outside the circular region segment inside the segmentation defined by the operationData.
 * It fills the segmentation pixels outside the  defined circle.
 * @param enabledElement - The element for which the segment is being erased.
 * @param operationData - EraseOperationData
 */
export function fillOutsideCircle(): void {
  throw new Error('Not yet implemented');
}

export {
  AREA_THRESHOLD_STRATEGY,
  CIRCLE_STRATEGY,
  CIRCLE_THRESHOLD_STRATEGY,
  createPointInEllipse as createEllipseInPoint,
  fillInsideCircle,
  thresholdInsideArea,
  thresholdInsideCircle,
};
