type CanvasMapperBindings = {
  getInputData: () => unknown;
  setInputData: (inputData: unknown) => void;
  modified: () => void;
};

/**
 * Mimics the VTK mapper functionality, but for non-vtk canvas based rendering
 * classes.
 */
export default class CanvasMapper {
  private bindings: CanvasMapperBindings | null = null;
  private inputData: unknown;
  private hasInputData = false;

  public setBindings(bindings: CanvasMapperBindings | null): void {
    this.bindings = bindings;

    if (bindings && this.hasInputData) {
      bindings.setInputData(this.inputData);
    }
  }

  public getInputData() {
    return this.bindings ? this.bindings.getInputData() : this.inputData;
  }

  public setInputData(inputData: unknown): void {
    this.inputData = inputData;
    this.hasInputData = true;
    this.bindings?.setInputData(inputData);
  }

  public modified(): void {
    this.bindings?.modified();
  }
}
