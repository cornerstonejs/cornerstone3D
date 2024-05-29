import BrushStrategy from './BrushStrategy.js';
import { SPHERE_STRATEGY } from './fillSphere.js';
import compositions from './compositions/index.js';

const ERASE_SPHERE_STRATEGY = new BrushStrategy(
  'EraseSphere',
  compositions.erase,
  ...SPHERE_STRATEGY.compositions
);

const eraseInsideSphere = ERASE_SPHERE_STRATEGY.strategyFunction;

export { eraseInsideSphere };
