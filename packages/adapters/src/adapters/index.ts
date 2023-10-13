import { CornerstoneSR, CornerstoneSEG } from "./Cornerstone";
import {
    Cornerstone3DSR,
    Cornerstone3DSEG,
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

const adaptersRT = {
    Cornerstone3D: Cornerstone3DRT
};

export { adaptersSR, adaptersSEG, adaptersRT, Enums, helpers };
