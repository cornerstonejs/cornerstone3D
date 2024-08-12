import BrushStrategy from './BrushStrategy';
import { CIRCLE_STRATEGY } from './fillCircle';
import { erase } from './compositions';

const ERASE_CIRCLE_STRATEGY = new BrushStrategy(
  'EraseCircle',
  erase,
  ...CIRCLE_STRATEGY.compositions
);

const eraseInsideCircle = ERASE_CIRCLE_STRATEGY.strategyFunction;

export { eraseInsideCircle };
