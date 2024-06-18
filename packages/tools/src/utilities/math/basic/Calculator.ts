import { Statistics } from '../../../types/index.js';

abstract class Calculator {
  static run: ({ value }) => void;
  static getStatistics: () => Statistics[];
}

export default Calculator;
