import type { Statistics } from '../../../types/CalculatorTypes';

abstract class Calculator {
  static run: ({ value }) => void;
  static getStatistics: () => Statistics[];
}

export default Calculator;
