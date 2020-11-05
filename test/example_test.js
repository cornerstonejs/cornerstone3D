import everything from '../src/index.js';
import vtkConeSource from 'vtk.js/Sources/Filters/Sources/ConeSource';

// import { User } from ... doesn't work right now since we don't have named exports set up
const { User } = everything;

describe('Some tests', () => {
  it('is truthy', () => {
    expect(true).toBeTruthy();
  });

  it('is not truthy', () => {
    console.log(User);
    console.log(vtkConeSource);
    expect(vtkConeSource).toBeTruthy();
    expect(User).toBeTruthy();
  });
});
