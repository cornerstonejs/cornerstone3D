import { BasicStatsCalculator } from '../../utilities/math/basic';
import AnnotationTool from './AnnotationTool';
import { PointInShape, Calculator } from '../../types';

export default abstract class extends AnnotationTool {
  calculator: Calculator = BasicStatsCalculator;

  public setCalculator(newCalculator: Calculator): void {
    this.calculator = newCalculator;
  }

  public calculateStats(points: PointInShape[]) {
    return this.calculator(points);
  }
}
