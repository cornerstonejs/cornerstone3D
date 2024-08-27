export = jpeg.lossless.Utils;
export = jpeg.lossless.Utils;
declare namespace Utils {
    function createArray(length: any, ...args: any[]): any[];
    function makeCRCTable(): number[];
    function crc32(dataView: any): number;
}
