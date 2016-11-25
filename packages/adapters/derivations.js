class DerivedDataset {
  constructor (datasets, options={}) {
    this.options = JSON.parse(JSON.stringify(options));
    let o = this.options;

    o.Manufacturer = options.Manufacturer || "Unspecified";
    o.ManufacturerModelName = options.ManufacturerModelName || "Unspecified";
    o.SeriesDescription = options.SeriesDescription || "Drived series";
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

    o.ImageComments = options.ImageComments || "NOT FOR CLINICAL USE";

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
      "ImageComments",
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
      "RescaleSlope",
      "RescaleIntercept",
      "PixelPresentation",
      "VolumetricProperties",
      "VolumeBasedCalculationTechnique",
      "PresentationLUTShape",
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
      "PixelRepresentation": "0",
      "LossyImageCompression": "00",
      "SegmentationType": "BINARY",
      "ContentLabel": "EXAMPLE",
    });

    let dimensionUID = DicomMetaDictionary.uid();
    this.dataset.DimensionOrganization = {
      DimensionOrganizationUID : dimensionUID
    };
    this.dataset.DimensionIndex = [
      {
        DimensionOrganizationUID : dimensionUID,
        DimensionIndexPointer : 6422539,
        FunctionalGroupPointer : 6422538, // SegmentIdentificationSequence
        DimensionDescriptionLabel : "ReferencedSegmentNumber"
      },
      {
        DimensionOrganizationUID : dimensionUID,
        DimensionIndexPointer : 2097202,
        FunctionalGroupPointer : 2134291, // PlanePositionSequence
        DimensionDescriptionLabel : "ImagePositionPatient"
      }
    ];

    // Example: Slicer tissue green
    this.dataset.Segment = [
      {
        SegmentedPropertyCategoryCode: {
          CodeValue: "T-D0050",
          CodingSchemeDesignator: "SRT",
          CodeMeaning: "Tissue"
        },
        SegmentNumber: 1,
        SegmentLabel: "Tissue",
        SegmentAlgorithmType: "SEMIAUTOMATIC",
        SegmentAlgorithmName: "Slicer Prototype",
        RecommendedDisplayCIELabValue: [ 43802, 26566, 37721 ],
        SegmentedPropertyTypeCode: {
          CodeValue: "T-D0050",
          CodingSchemeDesignator: "SRT",
          CodeMeaning: "Tissue"
        }
      }
    ];

    // TODO: check logic here.
    // If the referenced dataset itself references a series, then copy.
    // Otherwise, reference the dataset itself.
    // This should allow Slicer and others to get the correct original
    // images when loading Legacy Converted Images, but it's a workaround
    // that really doesn't belong here.
    if (this.referencedDataset.ReferencedSeries) {
      this.dataset.ReferencedSeries =
                    DerivedDataset.copyDataset(
                      this.referencedDataset.ReferencedSeries);
    } else {
      this.dataset.ReferencedSeries = {
        SeriesInstanceUID : this.referencedDataset.SeriesInstanceUID,
        ReferencedInstance : [{
          ReferencedSOPClass: this.referencedDataset.SOPClass,
          ReferencedSOPInstanceUID: this.referencedDataset.SOPInstanceUID,
        }]
      }
    }

    // handle the case of a converted multiframe, so point to original source
    // TODO: only a single segment is created now
    for (let frameIndex = 0; frameIndex < this.dataset.NumberOfFrames; frameIndex++) {
      this.dataset.PerFrameFunctionalGroups[frameIndex].DerivationImage = {
        SourceImage: {
          ReferencedSOPClass: this.referencedDataset.SOPClass,
          ReferencedSOPInstanceUID: this.referencedDataset.SOPInstanceUID,
          ReferencedFrameNumber: frameIndex+1,
          PurposeOfReferenceCode: {
            CodeValue: "121322",
            CodingSchemeDesignator: "DCM",
            CodeMeaning: "Source image for image processing operation"
          }
        },
        DerivationCode: {
          CodeValue: "113076",
          CodingSchemeDesignator: "DCM",
          CodeMeaning: "Segmentation"
        }
      };
      this.dataset.PerFrameFunctionalGroups[frameIndex].FrameContent = {
        DimensionIndexValues: [
          1,
          frameIndex+1
        ]
      };
      this.dataset.PerFrameFunctionalGroups[frameIndex].SegmentIdentification = {
        ReferencedSegmentNumber: 1
      };
    }

    // these are copied with pixels, but don't belong in segmentation
    for (let frameIndex = 0; frameIndex < this.dataset.NumberOfFrames; frameIndex++) {
      // TODO: instead explicitly copy the position sequence
      let group = this.dataset.PerFrameFunctionalGroups[frameIndex];
      delete(group.FrameVOILUT);
    }
    delete(this.dataset.SharedFunctionalGroups.PixelMeasures.SpacingBetweenSlices);

    // make an array of zeros for the pixels assuming bit packing (one bit per short)
    // TODO: handle different packing and non-multiple of 8/16 rows and columns
    this.dataset.PixelData = new ArrayBuffer(this.referencedDataset.PixelData.byteLength/16);
  }

  // TODO:
  addSegment(segment) {
    console.error("Not implemented");
  }
  removeSegment(segment) {
    console.error("Not implemented");
  }
}
