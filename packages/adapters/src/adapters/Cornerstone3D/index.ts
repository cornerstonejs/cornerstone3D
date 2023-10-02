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
import * as Segmentation from "./Segmentation";
import * as RTStruct from "./RTStruct";

const Cornerstone3DSR = {
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
    MeasurementReport,
    CodeScheme,
    CORNERSTONE_3D_TAG
};

const Cornerstone3DSEG = {
    Segmentation,
    RTStruct
};

export { Cornerstone3DSR, Cornerstone3DSEG };
