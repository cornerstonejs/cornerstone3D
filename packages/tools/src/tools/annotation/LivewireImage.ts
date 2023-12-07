class LivewireImage {
  private _data: number[][];
  private _width: number;
  private _height: number;

  constructor(rgbaPixelData: Uint8ClampedArray, width: number, height: number) {
    this._data = LivewireImage._convertRGBAToGrayscale(
      rgbaPixelData,
      width,
      height
    );
    this._width = width;
    this._height = height;
  }

  public get data(): number[][] {
    return this._data;
  }

  public get width(): number {
    return this._width;
  }

  public get height(): number {
    return this._height;
  }

  private static _convertRGBAToGrayscale(
    rgbaPixelData: Uint8ClampedArray,
    width: number,
    height: number
  ): number[][] {
    const grayscalePixelData = new Array(height);

    // 1/x because multiplication is faster than division
    const avgMultiplier = 1 / (3 * 255);

    // Compute actual values
    for (let y = 0; y < height; y++) {
      grayscalePixelData[y] = new Array(width);

      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4;
        grayscalePixelData[y][x] =
          (rgbaPixelData[p] + rgbaPixelData[p + 1] + rgbaPixelData[p + 2]) *
          avgMultiplier;
      }
    }

    return grayscalePixelData;
  }

  public dx(x: number, y: number) {
    // If it is at the end, back up one
    if (x + 1 === this._width) {
      x--;
    }
    return this._data[y][x + 1] - this._data[y][x];
  }

  public dy(x: number, y: number) {
    // If it is at the end, back up one
    if (y + 1 === this._height) {
      y--;
    }

    return this._data[y][x] - this._data[y + 1][x];
  }

  public gradMagnitude(x: number, y: number): number {
    const dx = this.dx(x, y);
    const dy = this.dy(x, y);

    return Math.sqrt(dx * dx + dy * dy);
  }

  public laplace(x: number, y: number): number {
    // Laplacian of Gaussian
    let lap = -16 * this._data[y][x];
    lap += this._data[y - 2][x];
    lap +=
      this._data[y - 1][x - 1] +
      2 * this._data[y - 1][x] +
      this._data[y - 1][x + 1];
    lap +=
      this._data[y][x - 2] +
      2 * this._data[y][x - 1] +
      2 * this._data[y][x + 1] +
      this._data[y][x + 2];
    lap +=
      this._data[y + 1][x - 1] +
      2 * this._data[y + 1][x] +
      this._data[y + 1][x + 1];
    lap += this._data[y + 2][x];

    return lap;
  }
}

export { LivewireImage as default, LivewireImage };
