class DerivedDataset {
  constructor (datasets, options={}) {
    this.options = JSON.parse(JSON.stringify(options));
    let o = this.options;

    o.Manufacturer = options.Manufacturer || "Unspecified";
    o.ManufacturerModelName = options.ManufacturerModelName || "Unspecified";
    o.SeriesDescription = options.SeriesDescription || "Segmentation";
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
    o.SeriesInstanceUID = options.SeriesInstanceUID || DicomMetaDictionary.uid();


    o.ClinicalTrialTimePointID = options.ClinicalTrialTimePointID || "";
    o.ClinicalTrialCoordinatingCenterName = options.ClinicalTrialCoordinatingCenterName || "";
    o.ClinicalTrialSeriesID = options.ClinicalTrialSeriesID || "";

    o.ContentLabel = options.ContentLabel || "";
    o.ContentDescription = options.ContentDescription || "";
    o.ContentCreatorName = options.ContentCreatorName || "";

    this.referencedDatasets = datasets; // list of one or more dicom-like object instances
    this.referencedDataset = this.referencedDatasets[0];
    this.dataset = {
      _vrMap: this.referencedDataset._vrMap,
      _meta: this.referencedDataset._meta,
    };

    this.derive();
  }

  assignToDataset(data) {
    Object.keys(data).forEach(key=>this.dataset[key] = data[key]);
  }

  assignFromReference(tags) {
    tags.forEach(tag=>this.dataset[tag] = this.referencedDataset[tag] || "");
  }

  assignFromOptions(tags) {
    tags.forEach(tag=>this.dataset[tag] = this.options[tag] || "");
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
      "StudyID",]);
  }

  static copyDataset(dataset) {
    // copies everything but the buffers
    return(JSON.parse(JSON.stringify(dataset)));
  }
}

class DerivedPixels extends DerivedDataset {
  constructor (datasets, options={}) {
    super(datasets, options);
  }

  // this assumes a normalized multiframe input and will create
  // a multiframe derived image
  derive() {
    super.derive();

    this.assignToDataset({
      "ImageType": [
        "DERIVED",
        "PRIMARY"
      ],
      "LossyImageCompression": "00",
      "InstanceNumber": "1",
    });

    this.assignFromReference([
      "SOPClass",
      "Modality",
      "FrameOfReferenceUID",
      "PositionReferenceIndicator",
      "NumberOfFrames",
      "Rows",
      "Columns",
      "SamplesPerPixel",
      "PhotometricInterpretation",
      "BitsStored",
      "HighBit",
      "PixelPresentation",
      "VolumetricProperties",
      "VolumeBasedCalculationTechnique",
      "PresentationLUTShape",
    ]);

    this.assignFromOptions([
      "Manufacturer",
      "SoftwareVersions",
      "DeviceSerialNumber",
      "ManufacturerModelName",
      "SeriesDescription",
      "SeriesNumber",
      "ContentLabel",
      "ContentDescription",
      "ContentCreatorName",
      "SeriesDate",
      "SeriesTime",
      "ContentDate",
      "ContentTime",
      "SOPInstanceUID",
      "SeriesInstanceUID",]);

    //
    // TODO: more carefully copy only PixelMeasures and related
    // TODO: add derivation references
    //
    if (this.referencedDataset.SharedFunctionalGroups) {
      this.dataset.SharedFunctionalGroups =
                    DerivedDataset.copyDataset(
                      this.referencedDataset.SharedFunctionalGroups);
    }
    if (this.referencedDataset.PerFrameFunctionalGroups) {
      this.dataset.PerFrameFunctionalGroups =
                    DerivedDataset.copyDataset(
                      this.referencedDataset.PerFrameFunctionalGroups);
    }

    // make an array of zeros for the pixels
    this.dataset.PixelData = new ArrayBuffer(this.referencedDataset.PixelData.byteLength);
  }
}

class DerivedImage extends DerivedPixels {
  constructor (datasets, options={}) {
    super(datasets, options);
  }

  derive() {
    super.derive();
    this.assignFromReference([
      "WindowCenter",
      "WindowWidth",
      "BitsAllocated",
      "PixelRepresentation",
      "Laterality",
      "PatientPosition",
    ]);
  }
}

class Segmentation extends DerivedPixels {
  constructor (datasets, options={}) {
    super(datasets, options);
  }

  derive() {
    super.derive();

    this.assignToDataset({
      "SOPClass": "Segmentation",
      "Modality": "SEG",
      "SamplesPerPixel": "1",
      "PhotometricInterpretation": "MONOCHROME2",
      "BitsAllocated": "1",
      "BitsStored": "1",
      "HighBit": "0",
      "PixelRepresentation": "1",
      "LossyImageCompression": "00",
      "SegmentationType": "BINARY",
    });


      //
      // TODO
      //
      /*
      "DimensionOrganization": {
        "DimensionOrganizationUID": "1.3.6.1.4.1.43046.3.0.42154.1458337731.665797"
      },
      "DimensionIndex": [
        {
          "DimensionOrganizationUID": "1.3.6.1.4.1.43046.3.0.42154.1458337731.665797",
          "DimensionIndexPointer": 6422539,
          "FunctionalGroupPointer": 6422538,
          "DimensionDescriptionLabel": "ReferencedSegmentNumber"
        },
        {
          "DimensionOrganizationUID": "1.3.6.1.4.1.43046.3.0.42154.1458337731.665797",
          "DimensionIndexPointer": 2097202,
          "FunctionalGroupPointer": 2134291,
          "DimensionDescriptionLabel": "ImagePositionPatient"
        }
      ],
      */

      /*
      "Segment": [
        {
          "SegmentedPropertyCategoryCode": {
            "CodeValue": "T-D0050",
            "CodingSchemeDesignator": "SRT",
            "CodeMeaning": "Tissue"
          },
          "SegmentNumber": 1,
          "SegmentLabel": "Liver",
          "SegmentAlgorithmType": "SEMIAUTOMATIC",
          "SegmentAlgorithmName": "SlicerEditor",
          "RecommendedDisplayCIELabValue": [
            41661,
            41167,
            40792
          ],
          "SegmentedPropertyTypeCode": {
            "CodeValue": "T-62000",
            "CodingSchemeDesignator": "SRT",
            "CodeMeaning": "Liver"
          }
        }
      ],
      */

    //
    // frame-specific data
    //
    /*
    "PerFrameFunctionalGroups": [
      {
        "DerivationImage": {
          "SourceImage": {
            "ReferencedSOPClass": "CTImage",
            "ReferencedSOPInstanceUID": "1.2.392.200103.20080913.113635.2.2009.6.22.21.43.10.23433.1",
            "PurposeOfReferenceCode": {
              "CodeValue": "121322",
              "CodingSchemeDesignator": "DCM",
              "CodeMeaning": "Source image for image processing operation"
            }
          },
          "DerivationCode": {
            "CodeValue": "113076",
            "CodingSchemeDesignator": "DCM",
            "CodeMeaning": "Segmentation"
          }
        },
        "FrameContent": {
          "DimensionIndexValues": [
            1,
            1
          ]
        },
        "PlanePosition": {
          "ImagePositionPatient": [
            "-2.352000e+02",
            "-2.268000e+02",
            "-1.286900e+02"
          ]
        },
        "SegmentIdentification": {
          "ReferencedSegmentNumber": 1
        }
      },
      {
        "DerivationImage": {
          "SourceImage": {
            "ReferencedSOPClass": "CTImage",
            "ReferencedSOPInstanceUID": "1.2.392.200103.20080913.113635.2.2009.6.22.21.43.10.23432.1",
            "PurposeOfReferenceCode": {
              "CodeValue": "121322",
              "CodingSchemeDesignator": "DCM",
              "CodeMeaning": "Source image for image processing operation"
            }
          },
          "DerivationCode": {
            "CodeValue": "113076",
            "CodingSchemeDesignator": "DCM",
            "CodeMeaning": "Segmentation"
          }
        },
        "FrameContent": {
          "DimensionIndexValues": [
            1,
            2
          ]
        },
        "PlanePosition": {
          "ImagePositionPatient": [
            "-2.352000e+02",
            "-2.268000e+02",
            "-1.276900e+02"
          ]
        },
        "SegmentIdentification": {
          "ReferencedSegmentNumber": 1
        }
      },
      {
        "DerivationImage": {
          "SourceImage": {
            "ReferencedSOPClass": "CTImage",
            "ReferencedSOPInstanceUID": "1.2.392.200103.20080913.113635.2.2009.6.22.21.43.10.23431.1",
            "PurposeOfReferenceCode": {
              "CodeValue": "121322",
              "CodingSchemeDesignator": "DCM",
              "CodeMeaning": "Source image for image processing operation"
            }
          },
          "DerivationCode": {
            "CodeValue": "113076",
            "CodingSchemeDesignator": "DCM",
            "CodeMeaning": "Segmentation"
          }
        },
        "FrameContent": {
          "DimensionIndexValues": [
            1,
            3
          ]
        },
        "PlanePosition": {
          "ImagePositionPatient": [
            "-2.352000e+02",
            "-2.268000e+02",
            "-1.266900e+02"
          ]
        },
        "SegmentIdentification": {
          "ReferencedSegmentNumber": 1
        }
      }
    ],
    */

      /*
      "ReferencedSeries": {
        "ReferencedInstance": [
          {
            "ReferencedSOPClass": "CTImage",
            "ReferencedSOPInstanceUID": "1.2.392.200103.20080913.113635.2.2009.6.22.21.43.10.23433.1"
          },
          { },
          { }
        ],
        "SeriesInstanceUID": "1.2.392.200103.20080913.113635.1.2009.6.22.21.43.10.23430.1"
      },
      */
  }
}
