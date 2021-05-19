interface IImage {
    imageId: string;
    sharedCacheKey?: string;
    minPixelValue: number;
    maxPixelValue: number;
    slope: number;
    intercept: number;
    windowCenter: number[];
    windowWidth: number[];
    getPixelData: () => Array<number>;
    getCanvas: () => HTMLCanvasElement;
    rows: number;
    columns: number;
    height: number;
    width: number;
    color: boolean;
    rgba: boolean;
    numComps: number;
    columnPixelSpacing: number;
    rowPixelSpacing: number;
    invert: boolean;
    sizeInBytes: number;
}
export default IImage;
