import { SplineSVGRenderer } from './SplineSVGRenderer';
import { CatmullRomSpline } from '../../CatmullRomSpline';

class CatmullRomRenderer extends SplineSVGRenderer<CatmullRomSpline> {}

export { CatmullRomRenderer as default, CatmullRomRenderer };
