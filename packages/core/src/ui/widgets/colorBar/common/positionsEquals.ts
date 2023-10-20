import { ColorBarPosition } from '../types/ColorBarPosition';

const positionsEqual = (a: ColorBarPosition, b: ColorBarPosition) => {
  return !!a && !!b && a.left === b.left && a.top === b.top;
};

export { positionsEqual as default, positionsEqual };
