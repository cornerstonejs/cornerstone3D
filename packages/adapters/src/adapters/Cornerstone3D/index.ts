import MeasurementReport from "./MeasurementReport";
import CodeScheme from "./CodingScheme";
import CORNERSTONE_3D_TAG from "./cornerstone3DTag";

import ArrowAnnotate from "./ArrowAnnotate";
import Bidirectional from "./Bidirectional";
import Angle from "./Angle";
import CobbAngle from "./CobbAngle";
import CircleROI from "./CircleROI";
import EllipticalROI from "./EllipticalROI";
import RectangleROI from "./RectangleROI";
import Length from "./Length";
import PlanarFreehandROI from "./PlanarFreehandROI";
import Probe from "./Probe";
import UltrasoundDirectional from "./UltrasoundDirectional";
import BaseAdapter3D from "./BaseAdapter3D";

import * as Segmentation from "./Segmentation";
import * as ParametricMap from "./ParametricMap";
import * as RTSS from "./RTStruct";
import KeyImage from "./KeyImage";

const Cornerstone3DSR = {
    BaseAdapter3D,
    Bidirectional,
    CobbAngle,
    Angle,
    Length,
    CircleROI,
    EllipticalROI,
    RectangleROI,
    ArrowAnnotate,
    Probe,
    PlanarFreehandROI,
    UltrasoundDirectional,
    KeyImage,
    MeasurementReport,
    CodeScheme,
    CORNERSTONE_3D_TAG
};

const Cornerstone3DSEG = {
    Segmentation
};

const Cornerstone3DPMAP = {
    ParametricMap
};

const Cornerstone3DRT = {
    RTSS
};

export {
    Cornerstone3DSR,
    Cornerstone3DSEG,
    Cornerstone3DPMAP,
    Cornerstone3DRT
};
