import BrushStrategy from './BrushStrategy';
import { SPHERE_STRATEGY } from './fillSphere';
import { erase } from './compositions';

const ERASE_SPHERE_STRATEGY = new BrushStrategy(
  'EraseSphere',
  erase,
  ...SPHERE_STRATEGY.compositions
);

const eraseInsideSphere = ERASE_SPHERE_STRATEGY.strategyFunction;

export { eraseInsideSphere };
