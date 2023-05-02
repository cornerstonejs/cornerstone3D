import { CornerstoneSR } from "./Cornerstone";
import { Cornerstone3DSR, Cornerstone3DSEG } from "./Cornerstone3D";
import { VTKjsSEG } from "./VTKjs";

const adaptersSR = {
    Cornerstone: CornerstoneSR,
    Cornerstone3D: Cornerstone3DSR
};

const adaptersSEG = {
    Cornerstone: CornerstoneSR,
    Cornerstone3D: Cornerstone3DSEG,
    VTKjs: VTKjsSEG
};

export { adaptersSR, adaptersSEG };
