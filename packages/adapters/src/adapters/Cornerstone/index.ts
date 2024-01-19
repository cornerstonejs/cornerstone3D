import MeasurementReport from "./MeasurementReport";
import Length from "./Length";
import FreehandRoi from "./FreehandRoi";
import Bidirectional from "./Bidirectional";
import EllipticalRoi from "./EllipticalRoi";
import CircleRoi from "./CircleRoi";
import ArrowAnnotate from "./ArrowAnnotate";
import CobbAngle from "./CobbAngle";
import Angle from "./Angle";
import RectangleRoi from "./RectangleRoi";

// Segmentation
import Segmentation from "./Segmentation";

const CornerstoneSR = {
    Length,
    FreehandRoi,
    Bidirectional,
    EllipticalRoi,
    CircleRoi,
    ArrowAnnotate,
    MeasurementReport,
    CobbAngle,
    Angle,
    RectangleRoi
};

const CornerstoneSEG = {
    Segmentation
};

export { CornerstoneSR, CornerstoneSEG };
