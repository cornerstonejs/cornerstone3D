declare type InterleavedFrame = {
    imageId: string;
    imageIdIndex: number;
};
export default function getInterleavedFrames(imageIds: Array<string>): Array<InterleavedFrame>;
export {};
