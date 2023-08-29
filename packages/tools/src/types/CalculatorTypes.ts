type StatisticValue = {
  name: string;
  value: number;
  unit: null | string;
};

abstract class Calculator {
  abstract statsCallback: ({ value }) => void;
  abstract getStatistics: () => StatisticValue[];
}

export default Calculator;
export type { StatisticValue };
