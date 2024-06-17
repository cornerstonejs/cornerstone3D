import { NamedStatistics } from '../../../types';

abstract class Calculator {
  static run: ({ value }) => void;
  /**
   * Gets the statistics as both an array of values, as well as the named values.
   */
  static getStatistics: () => NamedStatistics;
}

export default Calculator;
