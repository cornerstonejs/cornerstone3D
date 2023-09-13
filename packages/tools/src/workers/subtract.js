import { workerManagerComlink } from '@cornerstonejs/core';
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
  fib(n) {
    if (n <= 1) {
      return 1;
    }
    return obj.fib(n - 1) + obj.fib(n - 2);
  },
};

workerManagerComlink.expose(obj);
