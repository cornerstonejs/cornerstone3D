import { Statistics } from '../../../types';

abstract class Calculator {
  static run: ({ value }) => void;
  static getStatistics: () => Statistics[];
}

export default Calculator;
