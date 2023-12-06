import BrushStrategy from './BrushStrategy';
import { SPHERE_STRATEGY } from './fillSphere';
import initializeErase from './utils/initializeErase';

const ERASE_CIRCLE_STRATEGY = new BrushStrategy(
  'EraseSphere',
  initializeErase,
  ...SPHERE_STRATEGY.initializers
);

const eraseInsideSphere = ERASE_CIRCLE_STRATEGY.strategyFunction;

export { eraseInsideSphere };
