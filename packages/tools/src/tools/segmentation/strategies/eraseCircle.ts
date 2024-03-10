import BrushStrategy from './BrushStrategy';
import { CIRCLE_STRATEGY } from './fillCircle';
import compositions from './compositions';

const ERASE_CIRCLE_STRATEGY = new BrushStrategy(
  'EraseCircle',
  compositions.erase,
  ...CIRCLE_STRATEGY.compositions
);

const eraseInsideCircle = ERASE_CIRCLE_STRATEGY.strategyFunction;

export { eraseInsideCircle };
