import { ColorBarRange } from '../types/ColorBarRange';

const rangesEqual = (a: ColorBarRange, b: ColorBarRange) => {
  return !!a && !!b && a.lower === b.lower && a.upper === b.upper;
};

export { rangesEqual as default, rangesEqual };
