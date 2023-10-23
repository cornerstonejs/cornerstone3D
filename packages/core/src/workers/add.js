import { expose } from 'comlink';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';

const obj = {
  counter: 10,
  inc() {
    obj.counter++;
  },
  vtk() {
    const points = vtkDataArray.newInstance({
      numberOfComponents: 3,
      values: new Uint8Array([1, 2, 3, 4, 5, 6]),
    });

    console.debug(points);
  },
  fib({ number }) {
    if (number <= 1) {
      return 1;
    }
    return obj.fib({ number: number - 1 }) + obj.fib({ number: number - 2 });
  },
};

expose(obj);
