import { CornerstoneSR, CornerstoneSEG, CornerstonePMAP } from "./Cornerstone";
import {
    Cornerstone3DSR,
    Cornerstone3DSEG,
    Cornerstone3DPMAP,
    Cornerstone3DRT
} from "./Cornerstone3D";
import { VTKjsSEG } from "./VTKjs";
import * as Enums from "./enums";
import * as helpers from "./helpers";

const adaptersSR = {
    Cornerstone: CornerstoneSR,
    Cornerstone3D: Cornerstone3DSR
};

const adaptersSEG = {
    Cornerstone: CornerstoneSEG,
    Cornerstone3D: Cornerstone3DSEG,
    VTKjs: VTKjsSEG
};

const adaptersPMAP = {
    Cornerstone: CornerstonePMAP,
    Cornerstone3D: Cornerstone3DPMAP
    // VTKjs: VTKjsPMAP
};

const adaptersRT = {
    Cornerstone3D: Cornerstone3DRT
};

export { adaptersSR, adaptersSEG, adaptersPMAP, adaptersRT, Enums, helpers };
