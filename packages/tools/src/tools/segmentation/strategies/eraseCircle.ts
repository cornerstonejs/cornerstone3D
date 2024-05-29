import BrushStrategy from './BrushStrategy.js';
import { CIRCLE_STRATEGY } from './fillCircle.js';
import compositions from './compositions/index.js';

const ERASE_CIRCLE_STRATEGY = new BrushStrategy(
  'EraseCircle',
  compositions.erase,
  ...CIRCLE_STRATEGY.compositions
);

const eraseInsideCircle = ERASE_CIRCLE_STRATEGY.strategyFunction;

export { eraseInsideCircle };
