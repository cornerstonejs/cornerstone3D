import TID300Measurement from "./TID300Measurement.js";
import Length from "./Length.js";
import Bidirectional from "./Bidirectional.js";
import Polyline from "./Polyline.js";

// To be implemented:
// - Cornerstone Probe
// Note: OHIF currently uses Cornerstone's 'dragProbe'. We need to add the regular Probe tool, which drops a single point.
//
// Hierarchy
// TID 1500 MeasurementReport
// --TID 1501 Measurement Group
// ---Measurement Group (DCM 125007)
// ----TID 300 Measurement
// ------SCOORD. Graphic Type: POINT
//
//
// - Cornerstone Ellipse:
//
// Hierarchy
// TID 1500 MeasurementReport
// -TID 1410 Planar ROI Measurements
// --TID 1501 Measurement Group
// ---Measurement Group (DCM 125007)
// ----TID 300 Measurement
// ------SCOORD. Graphic Type: ELLIPSE
//        (ftp://dicom.nema.org/MEDICAL/dicom/current/output/chtml/part03/sect_C.10.5.html)
//
// If Graphic Type (0070,0023) is ELLIPSE, then exactly four points shall be present; the first two points are to be interpreted as the endpoints of the major axis and the second two points as the endpoints of the minor axis of an ellipse, some form of implementation dependent representation of which is to be drawn.
//
// TID 1401 Area Measurement: http://dicom.nema.org/medical/dicom/current/output/html/part16.html#sect_TID_1401
// Should be a sibling of the SCOORD
// Should specify the Mean Modality Pixel Value measured in whatever units the image is in
// Should specify the Standard Deviation Modality Pixel Value measured in whatever units the image is in
//
//
// - Cornerstone Rectangle ROI
//
// Hierarchy
// TID 1500 MeasurementReport
// --TID 1501 Measurement Group
// ---Measurement Group (DCM 125007)
// ----TID 300 Measurement
// ------SCOORD. Graphic Type: POLYLINE
// ------ Use concept corresponding to Rectangle measurement
//
//                 http://dicom.nema.org/medical/dicom/current/output/html/part16.html#sect_TID_4019
//
// OR
// Note: This should be the same as a Freehand ROI, more or less. We add a TID 4019: Algorithm Identification flag to specify that this was created (and should be rehydrated) into a Rectangle ROI.
// TODO: Should we use a Derivation instead? http://dicom.nema.org/medical/dicom/current/output/html/part16.html#DCM_121401
// Should specify the Area measured in mmˆ2, including the units in UCUM
// Should specify the Mean Modality Pixel Value measured in whatever units the image is in
// Should specify the Standard Deviation Modality Pixel Value measured in whatever units the image is in
//
//
// - Cornerstone Simple Angle tool
//
// Hierarchy
// TID 1500 MeasurementReport
// --TID 1501 Measurement Group
// ---Measurement Group (DCM 125007)
// ----TID 300 Measurement
// ------SCOORD. Graphic Type: POLYLINE
//        (ftp://dicom.nema.org/MEDICAL/dicom/current/output/chtml/part03/sect_C.10.5.html)
// ----TID 300 Measurement
// ------SCOORD. Graphic Type: POLYLINE
//        (ftp://dicom.nema.org/MEDICAL/dicom/current/output/chtml/part03/sect_C.10.5.html)
//
// ------ Use concept corresponding to Angle measurement
//
// Two lines specify the angle
// Should specify the Angle measured in Degrees, including the units in UCUM
//
const TID300 = {
    TID300Measurement,
    Length,
    Bidirectional,
    Polyline
};

export { TID300Measurement, Length };

export default TID300;
