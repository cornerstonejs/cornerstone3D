import { CodedConcept } from "./coding.js";
import {
    CodeContentItem,
    CompositeContentItem,
    ContentSequence,
    GraphicTypes,
    GraphicTypes3D,
    ImageContentItem,
    NumContentItem,
    PixelOriginInterpretations,
    RelationshipTypes,
    ScoordContentItem,
    Scoord3DContentItem,
    UIDRefContentItem
} from "./valueTypes.js";

class LongitudinalTemporalOffsetFromEvent extends NumContentItem {
    constructor(options) {
        super({
            name: new CodedConcept({
                value: "128740",
                meaning: "Longitudinal Temporal Offset from Event",
                schemeDesignator: "DCM"
            }),
            value: options.value,
            unit: options.unit,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.ContentSequence = new ContentSequence();
        const item = new CodeContentItem({
            name: new CodedConcept({
                value: "128741",
                meaning: "Longitudinal Temporal Event Type",
                schemeDesignator: "DCM"
            }),
            value: options.eventType,
            relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
        });
        this.ContentSequence.push(item);
    }
}

class SourceImageForRegion extends ImageContentItem {
    constructor(options) {
        super({
            name: new CodedConcept({
                value: "121324",
                meaning: "Source Image",
                schemeDesignator: "DCM"
            }),
            referencedSOPClassUID: options.referencedSOPClassUID,
            referencedSOPInstanceUID: options.referencedSOPInstanceUID,
            referencedFrameNumbers: options.referencedFrameNumbers,
            relationshipType: RelationshipTypes.SELECTED_FROM
        });
    }
}

class SourceImageForSegmentation extends ImageContentItem {
    constructor(options) {
        super({
            name: new CodedConcept({
                value: "121233",
                meaning: "Source Image for Segmentation",
                schemeDesignator: "DCM"
            }),
            referencedSOPClassUID: options.referencedSOPClassUID,
            referencedSOPInstanceUID: options.referencedSOPInstanceUID,
            referencedFrameNumbers: options.referencedFrameNumbers,
            relationshipType: RelationshipTypes.SELECTED_FROM
        });
    }
}

class SourceSeriesForSegmentation extends UIDRefContentItem {
    constructor(options) {
        super({
            name: new CodedConcept({
                value: "121232",
                meaning: "Source Series for Segmentation",
                schemeDesignator: "DCM"
            }),
            value: options.referencedSeriesInstanceUID,
            relationshipType: RelationshipTypes.CONTAINS
        });
    }
}

class ImageRegion extends ScoordContentItem {
    constructor(options) {
        super({
            name: new CodedConcept({
                value: "111030",
                meaning: "Image Region",
                schemeDesignator: "DCM"
            }),
            graphicType: options.graphicType,
            graphicData: options.graphicData,
            pixelOriginInterpretation: options.pixelOriginInterpretation,
            relationshipType: RelationshipTypes.CONTAINS
        });
        if (options.graphicType === GraphicTypes.MULTIPOINT) {
            throw new Error(
                "Graphic type 'MULTIPOINT' is not valid for region."
            );
        }
        if (options.sourceImage === undefined) {
            throw Error("Option 'sourceImage' is required for ImageRegion.");
        }
        if (
            !(
                options.sourceImage ||
                options.sourceImage.constructor === SourceImageForRegion
            )
        ) {
            throw new Error(
                "Option 'sourceImage' of ImageRegion must have type " +
                    "SourceImageForRegion."
            );
        }
        this.ContentSequence = new ContentSequence();
        this.ContentSequence.push(options.sourceImage);
    }
}

class ImageRegion3D extends Scoord3DContentItem {
    constructor(options) {
        super({
            name: new CodedConcept({
                value: "111030",
                meaning: "Image Region",
                schemeDesignator: "DCM"
            }),
            graphicType: options.graphicType,
            graphicData: options.graphicData,
            frameOfReferenceUID: options.frameOfReferenceUID,
            relationshipType: RelationshipTypes.CONTAINS
        });
        if (options.graphicType === GraphicTypes3D.MULTIPOINT) {
            throw new Error(
                "Graphic type 'MULTIPOINT' is not valid for region."
            );
        }
        if (options.graphicType === GraphicTypes3D.ELLIPSOID) {
            throw new Error(
                "Graphic type 'ELLIPSOID' is not valid for region."
            );
        }
    }
}

class VolumeSurface extends Scoord3DContentItem {
    constructor(options) {
        super({
            name: new CodedConcept({
                value: "121231",
                meaning: "Volume Surface",
                schemeDesignator: "DCM"
            }),
            graphicType: options.graphicType,
            graphicData: options.graphicData,
            frameOfFeferenceUID: options.frameOfFeferenceUID,
            relationshipType: RelationshipTypes.CONTAINS
        });
        if (options.graphicType !== GraphicTypes3D.ELLIPSOID) {
            throw new Error(
                "Graphic type for volume surface must be 'ELLIPSOID'."
            );
        }
        this.ContentSequence = new ContentSequence();
        if (options.sourceImages) {
            options.sourceImages.forEach(image => {
                if (!(image || image.constructor === SourceImageForRegion)) {
                    throw new Error(
                        "Items of option 'sourceImages' of VolumeSurface " +
                            "must have type SourceImageForRegion."
                    );
                }
                this.ContentSequence.push(image);
            });
        } else if (options.sourceSeries) {
            if (
                !(
                    options.sourceSeries ||
                    options.sourceSeries.constructor === SourceSeriesForRegion
                )
            ) {
                throw new Error(
                    "Option 'sourceSeries' of VolumeSurface " +
                        "must have type SourceSeriesForRegion."
                );
            }
            this.ContentSequence.push(options.sourceSeries);
        } else {
            throw new Error(
                "One of the following two options must be provided: " +
                    "'sourceImage' or 'sourceSeries'."
            );
        }
    }
}

class ReferencedRealWorldValueMap extends CompositeContentItem {
    constructor(options) {
        super({
            name: new CodedConcept({
                value: "126100",
                meaning: "Real World Value Map used for measurement",
                schemeDesignator: "DCM"
            }),
            referencedSOPClassUID: option.referencedSOPClassUID,
            referencedSOPInstanceUID: options.referencedSOPInstanceUID,
            relationshipType: RelationshipTypes.CONTAINS
        });
    }
}

class FindingSite extends CodeContentItem {
    constructor(options) {
        super({
            name: new CodedConcept({
                value: "363698007",
                meaning: "Finding Site",
                schemeDesignator: "SCT"
            }),
            value: options.anatomicLocation,
            relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
        });
        this.ContentSequence = new ContentSequence();
        if (options.laterality) {
            const item = new CodeContentItem({
                name: new CodedConcept({
                    value: "272741003",
                    meaning: "Laterality",
                    schemeDesignator: "SCT"
                }),
                value: options.laterality,
                relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
            });
            this.ContentSequence.push(item);
        }
        if (options.topographicalModifier) {
            const item = new CodeContentItem({
                name: new CodedConcept({
                    value: "106233006",
                    meaning: "Topographical Modifier",
                    schemeDesignator: "SCT"
                }),
                value: options.topographicalModifier,
                relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
            });
            this.ContentSequence.push(item);
        }
    }
}

class ReferencedSegmentationFrame extends ContentSequence {
    constructor(options) {
        if (options.sopClassUID === undefined) {
            throw new Error(
                "Option 'sopClassUID' is required for ReferencedSegmentationFrame."
            );
        }
        if (options.sopInstanceUID === undefined) {
            throw new Error(
                "Option 'sopInstanceUID' is required for ReferencedSegmentationFrame."
            );
        }
        if (options.frameNumber === undefined) {
            throw new Error(
                "Option 'frameNumber' is required for ReferencedSegmentationFrame."
            );
        }
        if (options.segmentNumber === undefined) {
            throw new Error(
                "Option 'segmentNumber' is required for ReferencedSegmentationFrame."
            );
        }
        if (options.sourceImage === undefined) {
            throw new Error(
                "Option 'sourceImage' is required for ReferencedSegmentationFrame."
            );
        }
        super();
        const segmentationItem = ImageContentItem({
            name: new CodedConcept({
                value: "121214",
                meaning: "Referenced Segmentation Frame",
                schemeDesignator: "DCM"
            }),
            referencedSOPClassUid: options.sopClassUid,
            referencedSOPInstanceUid: options.sopInstanceUid,
            referencedFrameNumber: options.frameNumber,
            referencedSegmentNumber: options.segmentNumber
        });
        this.push(segmentationItem);
        if (options.sourceImage.constructor !== SourceImageForSegmentation) {
            throw new Error(
                "Option 'sourceImage' must have type SourceImageForSegmentation."
            );
        }
        this.push(sourceImage);
    }
}

class ReferencedSegmentation extends ContentSequence {
    constructor(options) {
        if (options.sopClassUID === undefined) {
            throw new Error(
                "Option 'sopClassUID' is required for ReferencedSegmentation."
            );
        }
        if (options.sopInstanceUID === undefined) {
            throw new Error(
                "Option 'sopInstanceUID' is required for ReferencedSegmentation."
            );
        }
        if (options.frameNumbers === undefined) {
            throw new Error(
                "Option 'frameNumbers' is required for ReferencedSegmentation."
            );
        }
        if (options.segmentNumber === undefined) {
            throw new Error(
                "Option 'segmentNumber' is required for ReferencedSegmentation."
            );
        }
        super();
        const segmentationItem = new ImageContentItem({
            name: new CodedConcept({
                value: "121191",
                meaning: "Referenced Segment",
                schemeDesignator: "DCM"
            }),
            referencedSOPClassUid: options.sopClassUid,
            referencedSOPInstanceUid: options.sopInstanceUid,
            referencedFrameNumber: options.frameNumbers,
            referencedSegmentNumber: options.segmentNumber
        });
        this.push(segmentationItem);
        if (options.sourceImages !== undefined) {
            options.sourceImages.forEach(image => {
                if (
                    !image ||
                    image.constructor !== SourceImageForSegmentation
                ) {
                    throw new Error(
                        "Items of option 'sourceImages' must have type " +
                            "SourceImageForSegmentation."
                    );
                }
                this.push(image);
            });
        } else if (options.sourceSeries !== undefined) {
            if (
                options.sourceSeries.constructor !== SourceSeriesForSegmentation
            ) {
                throw new Error(
                    "Option 'sourceSeries' must have type SourceSeriesForSegmentation."
                );
            }
            this.push(sourceSeries);
        } else {
            throw new Error(
                "One of the following two options must be provided: " +
                    "'sourceImages' or 'sourceSeries'."
            );
        }
    }
}

export {
    FindingSite,
    LongitudinalTemporalOffsetFromEvent,
    ReferencedRealWorldValueMap,
    ImageRegion,
    ImageRegion3D,
    ReferencedSegmentation,
    ReferencedSegmentationFrame,
    VolumeSurface,
    SourceImageForRegion,
    SourceImageForSegmentation,
    SourceSeriesForSegmentation
};
