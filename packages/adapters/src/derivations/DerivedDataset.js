import { DicomMetaDictionary } from "../DicomMetaDictionary.js";

export default class DerivedDataset {
    constructor(datasets, options = {}) {
        this.options = JSON.parse(JSON.stringify(options));
        let o = this.options;

        o.Manufacturer = options.Manufacturer || "Unspecified";
        o.ManufacturerModelName =
            options.ManufacturerModelName || "Unspecified";
        o.SeriesDescription =
            options.SeriesDescription || "Research Derived series";
        o.SeriesNumber = options.SeriesNumber || "99";
        o.SoftwareVersions = options.SoftwareVersions || "0";
        o.DeviceSerialNumber = options.DeviceSerialNumber || "1";

        let date = DicomMetaDictionary.date();
        let time = DicomMetaDictionary.time();

        o.SeriesDate = options.SeriesDate || date;
        o.SeriesTime = options.SeriesTime || time;
        o.ContentDate = options.ContentDate || date;
        o.ContentTime = options.ContentTime || time;

        o.SOPInstanceUID = options.SOPInstanceUID || DicomMetaDictionary.uid();
        o.SeriesInstanceUID =
            options.SeriesInstanceUID || DicomMetaDictionary.uid();

        o.ClinicalTrialTimePointID = options.ClinicalTrialTimePointID || "";
        o.ClinicalTrialCoordinatingCenterName =
            options.ClinicalTrialCoordinatingCenterName || "";
        o.ClinicalTrialSeriesID = options.ClinicalTrialSeriesID || "";

        o.ImageComments = options.ImageComments || "NOT FOR CLINICAL USE";
        o.ContentQualification = "RESEARCH";

        this.referencedDatasets = datasets; // list of one or more dicom-like object instances
        this.referencedDataset = this.referencedDatasets[0];
        this.dataset = {
            _vrMap: this.referencedDataset._vrMap,
            _meta: this.referencedDataset._meta
        };

        this.derive();
    }

    assignToDataset(data) {
        Object.keys(data).forEach(key => (this.dataset[key] = data[key]));
    }

    assignFromReference(tags) {
        tags.forEach(
            tag => (this.dataset[tag] = this.referencedDataset[tag] || "")
        );
    }

    assignFromOptions(tags) {
        tags.forEach(tag => (this.dataset[tag] = this.options[tag] || ""));
    }

    derive() {
        // common for all instances in study
        this.assignFromReference([
            "AccessionNumber",
            "ReferringPhysicianName",
            "StudyDate",
            "StudyID",
            "StudyTime",
            "PatientName",
            "PatientID",
            "PatientBirthDate",
            "PatientSex",
            "PatientAge",
            "StudyInstanceUID",
            "StudyID"
        ]);

        this.assignFromOptions([
            "Manufacturer",
            "SoftwareVersions",
            "DeviceSerialNumber",
            "ManufacturerModelName",
            "SeriesDescription",
            "SeriesNumber",
            "ImageComments",
            "SeriesDate",
            "SeriesTime",
            "ContentDate",
            "ContentTime",
            "ContentQualification",
            "SOPInstanceUID",
            "SeriesInstanceUID"
        ]);
    }

    static copyDataset(dataset) {
        // copies everything but the buffers
        return JSON.parse(JSON.stringify(dataset));
    }
}
