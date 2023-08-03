import { BasicStatsCalculator } from '../../utilities/math/basic';
import AnnotationTool from './AnnotationTool';
import { PointInShape } from '../../utilities/math/basic/ICalculator';

export default abstract class AnnotationWithCachedStats extends AnnotationTool {
  calculator: BasicStatsCalculator = new BasicStatsCalculator();

  public setCalculator(newCalculator: BasicStatsCalculator): void {
    this.calculator = newCalculator;
  }

  public calculateStats(points: PointInShape[]) {
    return this.calculator.calculate(points);
  }
}
