import { CodedConcept } from "./coding.js";

const ValueTypes = {
    CODE: "CODE",
    COMPOSITE: "COMPOSITE",
    CONTAINER: "CONTAINER",
    DATE: "DATE",
    DATETIME: "DATETIME",
    IMAGE: "IMAGE",
    NUM: "NUM",
    PNAME: "PNAME",
    SCOORD: "SCOORD",
    SCOORD3D: "SCOORD3D",
    TCOORD: "TCOORD",
    TEXT: "TEXT",
    TIME: "TIME",
    UIDREF: "UIDREF",
    WAVEFORM: "WAVEFORM"
};
Object.freeze(ValueTypes);

const GraphicTypes = {
    CIRCLE: "CIRCLE",
    ELLIPSE: "ELLIPSE",
    ELLIPSOID: "ELLIPSOID",
    MULTIPOINT: "MULTIPOINT",
    POINT: "POINT",
    POLYLINE: "POLYLINE"
};
Object.freeze(GraphicTypes);

const GraphicTypes3D = {
    ELLIPSE: "ELLIPSE",
    ELLIPSOID: "ELLIPSOID",
    MULTIPOINT: "MULTIPOINT",
    POINT: "POINT",
    POLYLINE: "POLYLINE",
    POLYGON: "POLYGON"
};
Object.freeze(GraphicTypes3D);

const TemporalRangeTypes = {
    BEGIN: "BEGIN",
    END: "END",
    MULTIPOINT: "MULTIPOINT",
    MULTISEGMENT: "MULTISEGMENT",
    POINT: "POINT",
    SEGMENT: "SEGMENT"
};
Object.freeze(TemporalRangeTypes);

const RelationshipTypes = {
    CONTAINS: "CONTAINS",
    HAS_ACQ_CONTENT: "HAS ACQ CONTENT",
    HAS_CONCEPT_MOD: "HAS CONCEPT MOD",
    HAS_OBS_CONTEXT: "HAS OBS CONTEXT",
    HAS_PROPERTIES: "HAS PROPERTIES",
    INFERRED_FROM: "INFERRED FROM",
    SELECTED_FROM: "SELECTED FROM"
};
Object.freeze(RelationshipTypes);

const PixelOriginInterpretations = {
    FRAME: "FRAME",
    VOLUME: "VOLUME"
};
Object.freeze(RelationshipTypes);

function isFloat(n) {
    return n === +n && n !== (n | 0);
}

function isInteger(n) {
    return n === +n && n === (n | 0);
}

function zeroPad(value) {
    return (value > 9 ? "" : "0") + value;
}

function TM(date) {
    // %H%M%S.%f
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const milliseconds = date.getMilliseconds();
    return zeroPad(hours) + zeroPad(minutes) + zeroPad(seconds) + milliseconds;
}

function DA(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return year + zeroPad(month) + zeroPad(day);
}

function DT(date) {
    return DA(date) + TM(date);
}

class ContentSequence extends Array {
    constructor(...args) {
        super(...args);
    }

    // filterBy(options) {
    // }
}

class ContentItem {
    constructor(options) {
        if (options.name === undefined) {
            throw new Error("Option 'name' is required for ContentItem.");
        }
        if (options.name.constructor !== CodedConcept) {
            throw new Error("Option 'name' must have type CodedConcept.");
        }
        this.ConceptNameCodeSequence = [options.name];
        if (options.valueType === undefined) {
            throw new Error("Option 'valueType' is required for ContentItem.");
        }
        if (!(Object.values(ValueTypes).indexOf(options.valueType) !== -1)) {
            throw new Error(`Invalid value type ${options.valueType}`);
        }
        this.ValueType = options.valueType;
        if (options.relationshipType !== undefined) {
            if (
                !(
                    Object.values(RelationshipTypes).indexOf(
                        options.relationshipType
                    ) !== -1
                )
            ) {
                throw new Error(
                    `Invalid relationship type ${options.relationshipTypes}`
                );
            }
            this.RelationshipType = options.relationshipType;
        }
        // TODO: relationship type is required
    }

    // getContentItems(options) {
    //   // TODO: filter by name, value type and relationship type
    //   return this.ContentSequence;
    // }
}

class CodeContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.CODE
        });
        if (options.value === undefined) {
            throw new Error("Option 'value' is required for CodeContentItem.");
        }
        if (!(options.value || options.value.constructor === CodedConcept)) {
            throw new Error("Option 'value' must have type CodedConcept.");
        }
        this.ConceptCodeSequence = [options.value];
    }
}

class TextContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.TEXT
        });
        if (options.value === undefined) {
            throw new Error("Option 'value' is required for TextContentItem.");
        }
        if (
            !(
                typeof options.value === "string" ||
                options.value instanceof String
            )
        ) {
            throw new Error("Option 'value' must have type String.");
        }
        this.TextValue = options.value;
    }
}

class PNameContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.PNAME
        });
        if (options.value === undefined) {
            throw new Error("Option 'value' is required for PNameContentItem.");
        }
        if (
            !(
                typeof options.value === "string" ||
                options.value instanceof String
            )
        ) {
            throw new Error("Option 'value' must have type String.");
        }
        this.PersonName = options.value;
    }
}

class TimeContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.TIME
        });
        if (options.value === undefined) {
            throw new Error("Option 'value' is required for TimeContentItem.");
        }
        if (
            !(
                typeof options.value === "object" ||
                options.value instanceof Date
            )
        ) {
            throw new Error("Option 'value' must have type Date.");
        }
        this.Time = TM(options.value);
    }
}

class DateContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.DATE
        });
        if (options.value === undefined) {
            throw new Error("Option 'value' is required for DateContentItem.");
        }
        if (
            !(
                typeof options.value === "object" ||
                options.value instanceof Date
            )
        ) {
            throw new Error("Option 'value' must have type Date.");
        }
        this.Date = DA(options.value);
    }
}

class DateTimeContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.DATETIME
        });
        if (options.value === undefined) {
            throw new Error(
                "Option 'value' is required for DateTimeContentItem."
            );
        }
        if (
            !(
                typeof options.value === "object" ||
                options.value instanceof Date
            )
        ) {
            throw new Error("Option 'value' must have type Date.");
        }
        this.DateTime = DT(otions.value);
    }
}

class UIDRefContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.UIDREF
        });
        if (options.value === undefined) {
            throw new Error(
                "Option 'value' is required for UIDRefContentItem."
            );
        }
        if (
            !(
                typeof options.value === "string" ||
                options.value instanceof String
            )
        ) {
            throw new Error("Option 'value' must have type String.");
        }
        this.UID = options.value;
    }
}

class NumContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.NUM
        });
        if (options.value !== undefined) {
            if (
                !(
                    typeof options.value === "number" ||
                    options.value instanceof Number
                )
            ) {
                throw new Error("Option 'value' must have type Number.");
            }
            if (options.unit === undefined) {
                throw new Error(
                    "Option 'unit' is required for NumContentItem with 'value'."
                );
            }
            if (options.unit.constructor !== CodedConcept) {
                throw new Error("Option 'unit' must have type CodedConcept.");
            }
            const item = {};
            item.NumericValue = options.value;
            if (isFloat(options.value)) {
                item.FloatingPointValue = options.value;
            }
            item.MeasurementUnitsCodeSequence = [options.unit];
            this.MeasuredValueSequence = [item];
        } else if (options.qualifier !== undefined) {
            if (
                !(
                    options.qualifier ||
                    options.qualifier.constructor === CodedConcept
                )
            ) {
                throw new Error(
                    "Option 'qualifier' must have type CodedConcept."
                );
            }
            this.NumericValueQualifierCodeSequence = [options.qualifier];
        } else {
            throw new Error(
                "Either option 'value' or 'qualifier' is required for NumContentItem."
            );
        }
    }
}

class ContainerContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.CONTAINER
        });
        if (options.isContentContinuous !== undefined) {
            this.ContinuityOfContent = "CONTINUOUS";
        } else {
            this.ContinuityOfContent = "SEPARATE";
        }
        if (options.templateID !== undefined) {
            if (
                !(
                    typeof options.templateID === "string" ||
                    options.templateID instanceof String
                )
            ) {
                throw new Error("Option 'templateID' must have type String.");
            }
            const item = {};
            item.MappingResource = "DCMR";
            item.TemplateIdentifier = options.templateID;
            this.ContentTemplateSequence = [item];
        }
    }
}

class CompositeContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.COMPOSITE
        });
        if (options.referencedSOPClassUID === undefined) {
            throw new Error(
                "Option 'referencedSOPClassUID' is required for CompositeContentItem."
            );
        }
        if (options.referencedSOPInstanceUID === undefined) {
            throw new Error(
                "Option 'referencedSOPInstanceUID' is required for CompositeContentItem."
            );
        }
        if (
            !(
                typeof options.referencedSOPClassUID === "string" ||
                options.referencedSOPClassUID instanceof String
            )
        ) {
            throw new Error(
                "Option 'referencedSOPClassUID' must have type String."
            );
        }
        if (
            !(
                typeof options.referencedSOPInstanceUID === "string" ||
                options.referencedSOPInstanceUID instanceof String
            )
        ) {
            throw new Error(
                "Option 'referencedSOPInstanceUID' must have type String."
            );
        }
        const item = {};
        item.ReferencedSOPClassUID = options.referencedSOPClassUID;
        item.ReferencedSOPInstanceUID = options.referencedSOPInstanceUID;
        this.ReferenceSOPSequence = [item];
    }
}

class ImageContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.IMAGE
        });
        if (options.referencedSOPClassUID === undefined) {
            throw new Error(
                "Option 'referencedSOPClassUID' is required for ImageContentItem."
            );
        }
        if (options.referencedSOPInstanceUID === undefined) {
            throw new Error(
                "Option 'referencedSOPInstanceUID' is required for ImageContentItem."
            );
        }
        if (
            !(
                typeof options.referencedSOPClassUID === "string" ||
                options.referencedSOPClassUID instanceof String
            )
        ) {
            throw new Error(
                "Option 'referencedSOPClassUID' must have type String."
            );
        }
        if (
            !(
                typeof options.referencedSOPInstanceUID === "string" ||
                options.referencedSOPInstanceUID instanceof String
            )
        ) {
            throw new Error(
                "Option 'referencedSOPInstanceUID' must have type String."
            );
        }
        const item = {};
        item.ReferencedSOPClassUID = options.referencedSOPClassUID;
        item.ReferencedSOPInstanceUID = options.referencedSOPInstanceUID;
        if (options.referencedFrameNumbers !== undefined) {
            if (
                !(
                    typeof options.referencedFrameNumbers === "object" ||
                    options.referencedFrameNumbers instanceof Array
                )
            ) {
                throw new Error(
                    "Option 'referencedFrameNumbers' must have type Array."
                );
            }
            // FIXME: value multiplicity
            item.ReferencedFrameNumber = options.referencedFrameNumbers;
        }
        if (options.referencedFrameSegmentNumber !== undefined) {
            if (
                !(
                    typeof options.referencedSegmentNumbers === "object" ||
                    options.referencedSegmentNumbers instanceof Array
                )
            ) {
                throw new Error(
                    "Option 'referencedSegmentNumbers' must have type Array."
                );
            }
            // FIXME: value multiplicity
            item.ReferencedSegmentNumber = options.referencedSegmentNumbers;
        }
        this.ReferencedSOPSequence = [item];
    }
}

class ScoordContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.SCOORD
        });
        if (options.graphicType === undefined) {
            throw new Error(
                "Option 'graphicType' is required for ScoordContentItem."
            );
        }
        if (
            !(
                typeof options.graphicType === "string" ||
                options.graphicType instanceof String
            )
        ) {
            throw new Error(
                "Option 'graphicType' of ScoordContentItem must have type String."
            );
        }
        if (options.graphicData === undefined) {
            throw new Error(
                "Option 'graphicData' is required for ScoordContentItem."
            );
        }
        if (
            !(
                typeof options.graphicData === "object" ||
                options.graphicData instanceof Array
            )
        ) {
            throw new Error(
                "Option 'graphicData' of ScoordContentItem must have type Array."
            );
        }
        if (Object.values(GraphicTypes).indexOf(options.graphicType) === -1) {
            throw new Error(`Invalid graphic type '${options.graphicType}'.`);
        }
        if (options.graphicData[0] instanceof Array) {
            options.graphicData = [].concat.apply([], options.graphicData);
        }
        this.GraphicData = options.graphicData;
        options.pixelOriginInterpretation =
            options.pixelOriginInterpretation ||
            PixelOriginInterpretations.VOLUME;
        if (
            !(
                typeof options.pixelOriginInterpretation === "string" ||
                options.pixelOriginInterpretation instanceof String
            )
        ) {
            throw new Error(
                "Option 'pixelOriginInterpretation' must have type String."
            );
        }
        if (
            Object.values(PixelOriginInterpretations).indexOf(
                options.pixelOriginInterpretation
            ) === -1
        ) {
            throw new Error(
                `Invalid pixel origin interpretation '${options.pixelOriginInterpretation}'.`
            );
        }
        if (options.fiducialUID !== undefined) {
            if (
                !(
                    typeof options.fiducialUID === "string" ||
                    options.fiducialUID instanceof String
                )
            ) {
                throw new Error("Option 'fiducialUID' must have type String.");
            }
            this.FiducialUID = options.fiducialUID;
        }
    }
}

class Scoord3DContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.SCOORD3D
        });
        if (options.graphicType === undefined) {
            throw new Error(
                "Option 'graphicType' is required for Scoord3DContentItem."
            );
        }
        if (
            !(
                typeof options.graphicType === "string" ||
                options.graphicType instanceof String
            )
        ) {
            throw new Error("Option 'graphicType' must have type String.");
        }
        if (options.graphicData === undefined) {
            throw new Error(
                "Option 'graphicData' is required for Scoord3DContentItem."
            );
        }
        if (
            !(
                typeof options.graphicData === "object" ||
                options.graphicData instanceof Array
            )
        ) {
            throw new Error("Option 'graphicData' must have type Array.");
        }
        if (Object.values(GraphicTypes3D).indexOf(options.graphicType) === -1) {
            throw new Error(`Invalid graphic type '${options.graphicType}'.`);
        }
        if (options.graphicData[0] instanceof Array) {
            options.graphicData = [].concat.apply([], options.graphicData);
        }
        this.GraphicType = options.graphicType;
        this.GraphicData = options.graphicData;
        if (options.frameOfReferenceUID === undefined) {
            throw new Error(
                "Option 'frameOfReferenceUID' is required for Scoord3DContentItem."
            );
        }
        if (
            !(
                typeof options.frameOfReferenceUID === "string" ||
                options.frameOfReferenceUID instanceof String
            )
        ) {
            throw new Error(
                "Option 'frameOfReferenceUID' must have type String."
            );
        }
        this.ReferencedFrameOfReferenceUID = options.frameOfReferenceUID;
        if ("fiducialUID" in options) {
            if (
                !(
                    typeof options.fiducialUID === "string" ||
                    options.fiducialUID instanceof String
                )
            ) {
                throw new Error("Option 'fiducialUID' must have type String.");
            }
            this.FiducialUID = fiducialUID;
        }
    }
}

class TcoordContentItem extends ContentItem {
    constructor(options) {
        super({
            name: options.name,
            relationshipType: options.relationshipType,
            valueType: ValueTypes.TCOORD
        });
        if (options.temporalRangeType === undefined) {
            throw new Error(
                "Option 'temporalRangeType' is required for TcoordContentItem."
            );
        }
        if (
            Object.values(TemporalRangeTypes).indexOf(
                options.temporalRangeType
            ) === -1
        ) {
            throw new Error(
                `Invalid temporal range type '${options.temporalRangeType}'.`
            );
        }
        if (options.referencedSamplePositions === undefined) {
            if (
                !(
                    typeof options.referencedSamplePositions === "object" ||
                    options.referencedSamplePositions instanceof Array
                )
            ) {
                throw new Error(
                    "Option 'referencedSamplePositions' must have type Array."
                );
            }
            // TODO: ensure values are integers
            this.ReferencedSamplePositions = options.referencedSamplePositions;
        } else if (options.referencedTimeOffsets === undefined) {
            if (
                !(
                    typeof options.referencedTimeOffsets === "object" ||
                    options.referencedTimeOffsets instanceof Array
                )
            ) {
                throw new Error(
                    "Option 'referencedTimeOffsets' must have type Array."
                );
            }
            // TODO: ensure values are floats
            this.ReferencedTimeOffsets = options.referencedTimeOffsets;
        } else if (options.referencedDateTime === undefined) {
            if (
                !(
                    typeof options.referencedDateTime === "object" ||
                    options.referencedDateTime instanceof Array
                )
            ) {
                throw new Error(
                    "Option 'referencedDateTime' must have type Array."
                );
            }
            this.ReferencedDateTime = options.referencedDateTime;
        } else {
            throw new Error(
                "One of the following options is required for TcoordContentItem: " +
                    "'referencedSamplePositions', 'referencedTimeOffsets', or " +
                    "'referencedDateTime'."
            );
        }
    }
}

export {
    CodeContentItem,
    ContainerContentItem,
    ContentSequence,
    CompositeContentItem,
    DateContentItem,
    DateTimeContentItem,
    GraphicTypes,
    GraphicTypes3D,
    ImageContentItem,
    NumContentItem,
    PNameContentItem,
    PixelOriginInterpretations,
    RelationshipTypes,
    ScoordContentItem,
    Scoord3DContentItem,
    TcoordContentItem,
    TemporalRangeTypes,
    TextContentItem,
    TimeContentItem,
    UIDRefContentItem,
    ValueTypes
};
