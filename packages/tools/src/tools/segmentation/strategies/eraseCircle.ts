import BrushStrategy from './BrushStrategy';
import { CIRCLE_STRATEGY } from './fillCircle';
import initializeErase from './utils/initializeErase';

const ERASE_CIRCLE_STRATEGY = new BrushStrategy(
  'EraseCircle',
  initializeErase,
  ...CIRCLE_STRATEGY.initializers
);

const eraseInsideCircle = ERASE_CIRCLE_STRATEGY.strategyFunction;

export { eraseInsideCircle };
