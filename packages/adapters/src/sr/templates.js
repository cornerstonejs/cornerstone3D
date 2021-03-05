import { Code, CodedConcept } from "./coding.js";
import {
    CodeContentItem,
    CompositeContentItem,
    ContainerContentItem,
    ContentSequence,
    GraphicTypes,
    GraphicTypes3D,
    ImageContentItem,
    NumContentItem,
    PixelOriginInterpretations,
    PNameContentItem,
    RelationshipTypes,
    ScoordContentItem,
    Scoord3DContentItem,
    TextContentItem,
    UIDRefContentItem
} from "./valueTypes.js";
import {
    FindingSite,
    LongitudinalTemporalOffsetFromEvent,
    ImageRegion,
    ImageRegion3D,
    ReferencedSegmentation,
    ReferencedSegmentationFrame,
    VolumeSurface,
    ReferencedRealWorldValueMap,
    SourceImageForSegmentation,
    SourceSeriesForSegmentation
} from "./contentItems.js";

class Template extends ContentSequence {
    constructor(...args) {
        super(...args);
    }
}

class Measurement extends Template {
    constructor(options) {
        super();
        const valueItem = new NumContentItem({
            name: options.name,
            value: options.value,
            unit: options.unit,
            qualifier: options.qualifier,
            relationshipType: RelationshipTypes.CONTAINS
        });
        valueItem.ContentSequence = new ContentSequence();
        if (options.trackingIdentifier === undefined) {
            throw new Error(
                "Option 'trackingIdentifier' is required for Measurement."
            );
        }
        if (options.trackingIdentifier.constructor === TrackingIdentifier) {
            throw new Error(
                "Option 'trackingIdentifier' must have type TrackingIdentifier."
            );
        }
        valueItem.ContentSequence.push(...options.trackingIdentifier);
        if (options.method !== undefined) {
            const methodItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "370129005",
                    meaning: "Measurement Method",
                    schemeDesignator: "SCT"
                }),
                value: options.method,
                relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
            });
            valueItem.ContentSequence.push(methodItem);
        }
        if (options.derivation !== undefined) {
            const derivationItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "121401",
                    meaning: "Derivation",
                    schemeDesignator: "DCM"
                }),
                value: options.derivation,
                relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
            });
            valueItem.ContentSequence.push(derivationItem);
        }
        if (options.findingSites !== undefined) {
            if (
                !(
                    typeof options.findingSites === "object" ||
                    options.findingSites instanceof Array
                )
            ) {
                throw new Error("Option 'findingSites' must have type Array.");
            }
            options.findingSites.forEach(site => {
                if (!site || site.constructor !== FindingSite) {
                    throw new Error(
                        "Items of option 'findingSites' must have type FindingSite."
                    );
                }
                valueItem.ContentSequence.push(site);
            });
        }
        if (options.properties !== undefined) {
            if (options.properties.constructor !== MeasurementProperties) {
                throw new Error(
                    "Option 'properties' must have type MeasurementProperties."
                );
            }
            valueItem.ContentSequence.push(...options.properties);
        }
        if (options.referencedRegions !== undefined) {
            if (
                !(
                    typeof options.referencedRegions === "object" ||
                    options.referencedRegions instanceof Array
                )
            ) {
                throw new Error(
                    "Option 'referencedRegions' must have type Array."
                );
            }
            options.referencedRegions.forEach(region => {
                if (
                    !region ||
                    (region.constructor !== ImageRegion &&
                        region.constructor !== ImageRegion3D)
                ) {
                    throw new Error(
                        "Items of option 'referencedRegion' must have type " +
                            "ImageRegion or ImageRegion3D."
                    );
                }
                valueItem.ContentSequence.push(region);
            });
        } else if (options.referencedVolume !== undefined) {
            if (options.referencedVolume.constructor !== VolumeSurface) {
                throw new Error(
                    "Option 'referencedVolume' must have type VolumeSurface."
                );
            }
            valueItem.ContentSequence.push(options.referencedVolume);
        } else if (options.referencedSegmentation !== undefined) {
            if (
                options.referencedSegmentation.constructor !==
                    ReferencedSegmentation &&
                options.referencedSegmentation.constructor !==
                    ReferencedSegmentationFrame
            ) {
                throw new Error(
                    "Option 'referencedSegmentation' must have type " +
                        "ReferencedSegmentation or ReferencedSegmentationFrame."
                );
            }
            valueItem.ContentSequence.push(options.referencedSegmentation);
        }
        if (options.referencedRealWorldValueMap !== undefined) {
            if (
                options.referencedRealWorldValueMap.constructor !==
                ReferencedRealWorldValueMap
            ) {
                throw new Error(
                    "Option 'referencedRealWorldValueMap' must have type " +
                        "ReferencedRealWorldValueMap."
                );
            }
            valueItem.ContentSequence.push(options.referencedRealWorldValueMap);
        }
        if (options.algorithmId !== undefined) {
            if (options.algorithmId.constructor !== AlgorithmIdentification) {
                throw new Error(
                    "Option 'algorithmId' must have type AlgorithmIdentification."
                );
            }
            valueItem.ContentSequence.push(...options.algorithmId);
        }
        this.push(valueItem);
    }
}

class MeasurementProperties extends Template {
    constructor(options) {
        super();
        if (options.normality !== undefined) {
            const normalityItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "121402",
                    schemeDesignator: "DCM",
                    meaning: "Normality"
                }),
                value: options.normality,
                relationshipType: RelationshipTypes.HAS_PROPERTIES
            });
            this.push(normalityItem);
        }
        if (options.measurementStatisticalProperties !== undefined) {
            if (
                options.measurementStatisticalProperties.constructor !==
                MeasurementStatisticalProperties
            ) {
                throw new Error(
                    "Option 'measurmentStatisticalProperties' must have type " +
                        "MeasurementStatisticalProperties."
                );
            }
            this.push(...measurementStatisticalProperties);
        }
        if (options.normalRangeProperties !== undefined) {
            if (
                options.normalRangeProperties.constructor !==
                NormalRangeProperties
            ) {
                throw new Error(
                    "Option 'normalRangeProperties' must have type NormalRangeProperties."
                );
            }
            this.push(...normalRangeProperties);
        }
        if (options.levelOfSignificance !== undefined) {
            const levelOfSignificanceItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "121403",
                    schemeDesignator: "DCM",
                    meaning: "Level of Significance"
                }),
                value: options.levelOfSignificance,
                relationshipType: RelationshipTypes.HAS_PROPERTIES
            });
            this.push(levelOfSignificanceItem);
        }
        if (options.selectionStatus !== undefined) {
            const selectionStatusItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "121404",
                    schemeDesignator: "DCM",
                    meaning: "Selection Status"
                }),
                value: options.selectionStatus,
                relationshipType: RelationshipTypes.HAS_PROPERTIES
            });
            this.push(selectionStatusItem);
        }
        if (options.upperMeasurementUncertainty !== undefined) {
            const upperMeasurementUncertaintyItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "R-00364",
                    schemeDesignator: "SRT",
                    meaning: "Range of Upper Measurement Uncertainty"
                }),
                value: options.upperMeasurementUncertainty,
                relationshipType: RelationshipTypes.HAS_PROPERTIES
            });
            this.push(upperMeasurementUncertaintyItem);
        }
        if (options.lowerMeasurementUncertainty !== undefined) {
            const lowerMeasurementUncertaintyItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "R-00362",
                    schemeDesignator: "SRT",
                    meaning: "Range of Lower Measurement Uncertainty"
                }),
                value: options.lowerMeasurementUncertainty,
                relationshipType: RelationshipTypes.HAS_PROPERTIES
            });
            this.push(lowerMeasurementUncertaintyItem);
        }
    }
}

class MeasurementStatisticalProperties extends Template {
    constructor(options) {
        super();
        if (options.values === undefined) {
            throw new Error(
                "Option 'values' is required for MeasurementStatisticalProperties."
            );
        }
        if (
            !(
                typeof options.values === "object" ||
                options.values instanceof Array
            )
        ) {
            throw new Error("Option 'values' must have type Array.");
        }
        options.values.forEach(value => {
            if (
                !options.concept ||
                options.concept.constructor !== NumContentItem
            ) {
                throw new Error(
                    "Items of option 'values' must have type NumContentItem."
                );
            }
            this.push(value);
        });
        if (options.description !== undefined) {
            const descriptionItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121405",
                    schemeDesignator: "DCM",
                    meaning: "Population Description"
                }),
                value: options.authority,
                relationshipType: RelationshipTypes.HAS_PROPERTIES
            });
            this.push(authorityItem);
        }
        if (options.authority !== undefined) {
            const authorityItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121406",
                    schemeDesignator: "DCM",
                    meaning: "Population Authority"
                }),
                value: options.authority,
                relationshipType: RelationshipTypes.HAS_PROPERTIES
            });
            this.push(authorityItem);
        }
    }
}

class NormalRangeProperties extends Template {
    constructor(options) {
        super();
        if (options.values === undefined) {
            throw new Error(
                "Option 'values' is required for NormalRangeProperties."
            );
        }
        if (
            !(
                typeof options.values === "object" ||
                options.values instanceof Array
            )
        ) {
            throw new Error("Option 'values' must have type Array.");
        }
        options.values.forEach(value => {
            if (
                !options.concept ||
                options.concept.constructor !== NumContentItem
            ) {
                throw new Error(
                    "Items of option 'values' must have type NumContentItem."
                );
            }
            this.push(value);
        });
        if (options.description !== undefined) {
            const descriptionItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121407",
                    schemeDesignator: "DCM",
                    meaning: "Normal Range Description"
                }),
                value: options.authority,
                relationshipType: RelationshipTypes.HAS_PROPERTIES
            });
            this.push(authorityItem);
        }
        if (options.authority !== undefined) {
            const authorityItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121408",
                    schemeDesignator: "DCM",
                    meaning: "Normal Range Authority"
                }),
                value: options.authority,
                relationshipType: RelationshipTypes.HAS_PROPERTIES
            });
            this.push(authorityItem);
        }
    }
}

class ObservationContext extends Template {
    constructor(options) {
        super();
        if (options.observerPersonContext === undefined) {
            throw new Error(
                "Option 'observerPersonContext' is required for ObservationContext."
            );
        }
        if (options.observerPersonContext.constructor !== ObserverContext) {
            throw new Error(
                "Option 'observerPersonContext' must have type ObserverContext"
            );
        }
        this.push(...options.observerPersonContext);
        if (options.observerDeviceContext !== undefined) {
            if (options.observerDeviceContext.constructor !== ObserverContext) {
                throw new Error(
                    "Option 'observerDeviceContext' must have type ObserverContext"
                );
            }
            this.push(...options.observerDeviceContext);
        }
        if (options.subjectContext !== undefined) {
            if (options.subjectContext.constructor !== SubjectContext) {
                throw new Error(
                    "Option 'subjectContext' must have type SubjectContext"
                );
            }
            this.push(...options.subjectContext);
        }
    }
}

class ObserverContext extends Template {
    constructor(options) {
        super();
        if (options.observerType === undefined) {
            throw new Error(
                "Option 'observerType' is required for ObserverContext."
            );
        } else {
            if (
                options.observerType.constructor !== Code &&
                options.observerType.constructor !== CodedConcept
            ) {
                throw new Error(
                    "Option 'observerType' must have type Code or CodedConcept."
                );
            }
        }
        const observerTypeItem = new CodeContentItem({
            name: new CodedConcept({
                value: "121005",
                meaning: "Observer Type",
                schemeDesignator: "DCM"
            }),
            value: options.observerType,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.push(observerTypeItem);
        if (options.observerIdentifyingAttributes === undefined) {
            throw new Error(
                "Option 'observerIdentifyingAttributes' is required for ObserverContext."
            );
        }
        // FIXME
        const person = new CodedConcept({
            value: "121006",
            schemeDesignator: "DCM",
            meaning: "Person"
        });
        const device = new CodedConcept({
            value: "121007",
            schemeDesignator: "DCM",
            meaning: "Device"
        });
        if (person.equals(options.observerType)) {
            if (
                options.observerIdentifyingAttributes.constructor !==
                PersonObserverIdentifyingAttributes
            ) {
                throw new Error(
                    "Option 'observerIdentifyingAttributes' must have type " +
                        "PersonObserverIdentifyingAttributes for 'Person' observer type."
                );
            }
        } else if (device.equals(options.observerType)) {
            if (
                options.observerIdentifyingAttributes.constructor !==
                DeviceObserverIdentifyingAttributes
            ) {
                throw new Error(
                    "Option 'observerIdentifyingAttributes' must have type " +
                        "DeviceObserverIdentifyingAttributes for 'Device' observer type."
                );
            }
        } else {
            throw new Error(
                "Option 'oberverType' must be either 'Person' or 'Device'."
            );
        }
        this.push(...options.observerIdentifyingAttributes);
    }
}

class PersonObserverIdentifyingAttributes extends Template {
    constructor(options) {
        super();
        if (options.name === undefined) {
            throw new Error(
                "Option 'name' is required for PersonObserverIdentifyingAttributes."
            );
        }
        const nameItem = new PNameContentItem({
            name: new CodedConcept({
                value: "121008",
                meaning: "Person Observer Name",
                schemeDesignator: "DCM"
            }),
            value: options.name,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.push(nameItem);
        if (options.loginName !== undefined) {
            const loginNameItem = new TextContentItem({
                name: new CodedConcept({
                    value: "128774",
                    meaning: "Person Observer's Login Name",
                    schemeDesignator: "DCM"
                }),
                value: options.loginName,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(loginNameItem);
        }
        if (options.organizationName !== undefined) {
            const organizationNameItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121009",
                    meaning: "Person Observer's Organization Name",
                    schemeDesignator: "DCM"
                }),
                value: options.organizationName,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(organizationNameItem);
        }
        if (options.roleInOrganization !== undefined) {
            const roleInOrganizationItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "121010",
                    meaning: "Person Observer's Role in the Organization",
                    schemeDesignator: "DCM"
                }),
                value: options.roleInOrganization,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(roleInOrganizationItem);
        }
        if (options.roleInProcedure !== undefined) {
            const roleInProcedureItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "121011",
                    meaning: "Person Observer's Role in this Procedure",
                    schemeDesignator: "DCM"
                }),
                value: options.roleInProcedure,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(roleInProcedureItem);
        }
    }
}

class DeviceObserverIdentifyingAttributes extends Template {
    constructor(options) {
        super();
        if (options.uid === undefined) {
            throw new Error(
                "Option 'uid' is required for DeviceObserverIdentifyingAttributes."
            );
        }
        const deviceObserverItem = new UIDRefContentItem({
            name: new CodedConcept({
                value: "121012",
                meaning: "Device Observer UID",
                schemeDesignator: "DCM"
            }),
            value: options.uid,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.push(deviceObserverItem);
        if (options.manufacturerName !== undefined) {
            const manufacturerNameItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121013",
                    meaning: "Device Observer Manufacturer",
                    schemeDesignator: "DCM"
                }),
                value: options.manufacturerName,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(manufacturerNameItem);
        }
        if (options.modelName !== undefined) {
            const modelNameItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121015",
                    meaning: "Device Observer Model Name",
                    schemeDesignator: "DCM"
                }),
                value: options.modelName,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(modelNameItem);
        }
        if (options.serialNumber !== undefined) {
            const serialNumberItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121016",
                    meaning: "Device Observer Serial Number",
                    schemeDesignator: "DCM"
                }),
                value: options.serialNumber,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(serialNumberItem);
        }
        if (options.physicalLocation !== undefined) {
            const physicalLocationItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121017",
                    meaning:
                        "Device Observer Physical Location During Observation",
                    schemeDesignator: "DCM"
                }),
                value: options.physicalLocation,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(physicalLocationItem);
        }
        if (options.roleInProcedure !== undefined) {
            const roleInProcedureItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "113876",
                    meaning: "Device Role in Procedure",
                    schemeDesignator: "DCM"
                }),
                value: options.roleInProcedure,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(roleInProcedureItem);
        }
    }
}

class SubjectContext extends Template {
    constructor(options) {
        super();
        if (options.subjectClass === undefined) {
            throw new Error(
                "Option 'subjectClass' is required for SubjectContext."
            );
        }
        if (options.subjectClassSpecificContext === undefined) {
            throw new Error(
                "Option 'subjectClassSpecificContext' is required for SubjectContext."
            );
        }
        const subjectClassItem = new CodeContentItem({
            name: new CodedConcept({
                value: "121024",
                meaning: "Subject Class",
                schemeDesignator: "DCM"
            }),
            value: options.subjectClass,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.push(subjectClassItem);
        const fetus = new CodedConcept({
            value: "121026 ",
            schemeDesignator: "DCM",
            meaning: "Fetus"
        });
        const specimen = new CodedConcept({
            value: "121027",
            schemeDesignator: "DCM",
            meaning: "Specimen"
        });
        const device = new CodedConcept({
            value: "121192",
            schemeDesignator: "DCM",
            meaning: "Device Subject"
        });
        if (fetus.equals(options.subjectClass)) {
            if (
                options.subjectClassSpecificContext.constructor !==
                SubjectContextFetus
            ) {
                throw new Error(
                    "Option 'subjectClass' must have type " +
                        "SubjectContextFetus for 'Fetus' subject class."
                );
            }
        } else if (specimen.equals(options.subjectClass)) {
            if (
                options.subjectClassSpecificContext.constructor !==
                SubjectContextSpecimen
            ) {
                throw new Error(
                    "Option 'subjectClass' must have type " +
                        "SubjectContextSpecimen for 'Specimen' subject class."
                );
            }
        } else if (device.equals(options.subjectClass)) {
            if (
                options.subjectClassSpecificContext.constructor !==
                SubjectContextDevice
            ) {
                throw new Error(
                    "Option 'subjectClass' must have type " +
                        "SubjectContextDevice for 'Device' subject class."
                );
            }
        } else {
            throw new Error(
                "Option 'subjectClass' must be either 'Fetus', 'Specimen', or 'Device'."
            );
        }
        this.push(...options.subjectClassSpecificContext);
    }
}

class SubjectContextFetus extends Template {
    constructor(options) {
        super();
        if (options.subjectID === undefined) {
            throw new Error(
                "Option 'subjectID' is required for SubjectContextFetus."
            );
        }
        const subjectIdItem = new TextContentItem({
            name: new CodedConcept({
                value: "121030",
                meaning: "Subject ID",
                schemeDesignator: "DCM"
            }),
            value: options.subjectID,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.push(subjectIdItem);
    }
}

class SubjectContextSpecimen extends Template {
    constructor(options) {
        super();
        if (options.uid === undefined) {
            throw new Error(
                "Option 'uid' is required for SubjectContextSpecimen."
            );
        }
        const specimenUidItem = new UIDRefContentItem({
            name: new CodedConcept({
                value: "121039",
                meaning: "Specimen UID",
                schemeDesignator: "DCM"
            }),
            value: options.uid,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.push(specimenUidItem);
        if (options.identifier !== undefined) {
            const specimenIdentifierItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121041",
                    meaning: "Specimen Identifier",
                    schemeDesignator: "DCM"
                }),
                value: options.identifier,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(specimenIdentifierItem);
        }
        if (options.containerIdentifier !== undefined) {
            const containerIdentifierItem = new TextContentItem({
                name: new CodedConcept({
                    value: "111700",
                    meaning: "Specimen Container Identifier",
                    schemeDesignator: "DCM"
                }),
                value: options.containerIdentifier,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(containerIdentifierItem);
        }
        if (options.specimenType !== undefined) {
            const specimenTypeItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "R-00254",
                    meaning: "Specimen Type",
                    schemeDesignator: "DCM"
                }),
                value: options.specimenType,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(specimenTypeItem);
        }
    }
}

class SubjectContextDevice extends Template {
    constructor(options) {
        if (options.name === undefined) {
            throw new Error(
                "Option 'name' is required for SubjectContextDevice."
            );
        }
        const deviceNameItem = new TextContentItem({
            name: new CodedConcept({
                value: "121193",
                meaning: "Device Subject Name",
                schemeDesignator: "DCM"
            }),
            value: options.name,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.push(deviceNameItem);
        if (options.uid !== undefined) {
            const deviceUidItem = new UIDRefContentItem({
                name: new CodedConcept({
                    value: "121198",
                    meaning: "Device Subject UID",
                    schemeDesignator: "DCM"
                }),
                value: options.uid,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(deviceUidItem);
        }
        if (options.manufacturerName !== undefined) {
            const manufacturerNameItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121194",
                    meaning: "Device Subject Manufacturer",
                    schemeDesignator: "DCM"
                }),
                value: options.manufacturerName,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(manufacturerNameItem);
        }
        if (options.modelName !== undefined) {
            const modelNameItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121195",
                    meaning: "Device Subject Model Name",
                    schemeDesignator: "DCM"
                }),
                value: options.modelName,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(modelNameItem);
        }
        if (options.serialNumber !== undefined) {
            const serialNumberItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121196",
                    meaning: "Device Subject Serial Number",
                    schemeDesignator: "DCM"
                }),
                value: options.serialNumber,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(serialNumberItem);
        }
        if (options.physicalLocation !== undefined) {
            const physicalLocationItem = new TextContentItem({
                name: new CodedConcept({
                    value: "121197",
                    meaning:
                        "Device Subject Physical Location During Observation",
                    schemeDesignator: "DCM"
                }),
                value: options.physicalLocation,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(physicalLocationItem);
        }
    }
}

class LanguageOfContentItemAndDescendants extends Template {
    constructor(options) {
        super();
        if (options.language === undefined) {
            options.language = new CodedConcept({
                value: "en-US",
                schemeDesignator: "RFC5646",
                meaning: "English (United States)"
            });
        }
        const languageItem = new CodeContentItem({
            name: new CodedConcept({
                value: "121049",
                meaning: "Language of Content Item and Descendants",
                schemeDesignator: "DCM"
            }),
            value: options.language,
            relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
        });
        this.push(languageItem);
    }
}

class _MeasurementsAndQualitatitiveEvaluations extends Template {
    constructor(options) {
        super();
        const groupItem = new ContainerContentItem({
            name: new CodedConcept({
                value: "125007",
                meaning: "Measurement Group",
                schemeDesignator: "DCM"
            }),
            relationshipType: RelationshipTypes.CONTAINS
        });
        groupItem.ContentSequence = new ContentSequence();
        if (options.trackingIdentifier === undefined) {
            throw new Error(
                "Option 'trackingIdentifier' is required for measurements group."
            );
        }
        if (options.trackingIdentifier.constructor !== TrackingIdentifier) {
            throw new Error(
                "Option 'trackingIdentifier' must have type TrackingIdentifier."
            );
        }
        if (options.trackingIdentifier.length !== 2) {
            throw new Error(
                "Option 'trackingIdentifier' must include a human readable tracking " +
                    "identifier and a tracking unique identifier."
            );
        }
        groupItem.ContentSequence.push(...options.trackingIdentifier);
        if (options.session !== undefined) {
            const sessionItem = new TextContentItem({
                name: new CodedConcept({
                    value: "C67447",
                    meaning: "Activity Session",
                    schemeDesignator: "NCIt"
                }),
                value: options.session,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            groupItem.ContentSequence.push(sessionItem);
        }
        if (options.findingType !== undefined) {
            const findingTypeItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "121071",
                    meaning: "Finding",
                    schemeDesignator: "DCM"
                }),
                value: options.findingType,
                relationshipType: RelationshipTypes.CONTAINS
            });
            groupItem.ContentSequence.push(findingTypeItem);
        }
        if (options.timePointContext !== undefined) {
            if (options.timePointContext.constructor !== TimePointContext) {
                throw new Error(
                    "Option 'timePointContext' must have type TimePointContext."
                );
            }
            groupItem.ContentSequence.push(...timePointContext);
        }
        if (options.referencedRealWorldValueMap !== undefined) {
            if (
                options.referencedRealWorldValueMap.constructor !==
                ReferencedRealWorldValueMap
            ) {
                throw new Error(
                    "Option 'referencedRealWorldValleMap' must have type " +
                        "ReferencedRealWorldValueMap."
                );
            }
            groupItem.ContentSequence.push(options.referencedRealWorldValueMap);
        }
        if (options.measurements !== undefined) {
            if (
                !(
                    typeof options.measurements === "object" ||
                    options.measurements instanceof Array
                )
            ) {
                throw new Error("Option 'measurements' must have type Array.");
            }
            options.measurements.forEach(measurement => {
                console.log(measurement);
                if (
                    !measurement ||
                    measurement.constructor !== NumContentItem
                ) {
                    throw new Error(
                        "Items of option 'measurement' must have type NumContentItem."
                    );
                }
                groupItem.ContentSequence.push(measurement);
            });
        }
        if (options.qualitativeEvaluations !== undefined) {
            if (
                !(
                    typeof options.qualitativeEvaluations === "object" ||
                    options.qualitativeEvaluations instanceof Array
                )
            ) {
                throw new Error(
                    "Option 'qualitativeEvaluations' must have type Array."
                );
            }
            options.qualitativeEvaluations.forEach(evaluation => {
                if (
                    !evaluation ||
                    (evaluation.constructor !== CodeContentItem &&
                        evaluation.constructor !== TextContentItem)
                ) {
                    throw new Error(
                        "Items of option 'qualitativeEvaluations' must have type " +
                            "CodeContentItem or TextContentItem."
                    );
                }
                groupItem.ContentSequence.push(evaluation);
            });
        }
        this.push(groupItem);
    }
}

class _ROIMeasurementsAndQualitativeEvaluations extends _MeasurementsAndQualitatitiveEvaluations {
    constructor(options) {
        super({
            trackingIdentifier: options.trackingIdentifier,
            timePointContext: options.timePointContext,
            findingType: options.findingType,
            session: options.session,
            measurements: options.measurements,
            qualitativeEvaluations: options.qualitativeEvaluations
        });
        const groupItem = this[0];
        const wereReferencesProvided = [
            options.referencedRegions !== undefined,
            options.referencedVolume !== undefined,
            options.referencedSegmentation !== undefined
        ];
        const numReferences = wereReferencesProvided.reduce((a, b) => a + b);
        if (numReferences === 0) {
            throw new Error(
                "One of the following options must be provided: " +
                    "'referencedRegions', 'referencedVolume', or " +
                    "'referencedSegmentation'."
            );
        } else if (numReferences > 1) {
            throw new Error(
                "Only one of the following options should be provided: " +
                    "'referencedRegions', 'referencedVolume', or " +
                    "'referencedSegmentation'."
            );
        }
        if (options.referencedRegions !== undefined) {
            if (
                !(
                    typeof options.referencedRegions === "object" ||
                    options.referencedRegions instanceof Array
                )
            ) {
                throw new Error(
                    "Option 'referencedRegions' must have type Array."
                );
            }
            if (options.referencedRegions.length === 0) {
                throw new Error(
                    "Option 'referencedRegion' must have non-zero length."
                );
            }
            options.referencedRegions.forEach(region => {
                if (
                    region === undefined ||
                    (region.constructor !== ImageRegion &&
                        region.constructor !== ImageRegion3D)
                ) {
                    throw new Error(
                        "Items of option 'referencedRegion' must have type " +
                            "ImageRegion or ImageRegion3D."
                    );
                }
                groupItem.ContentSequence.push(region);
            });
        } else if (options.referencedVolume !== undefined) {
            if (options.referencedVolume.constructor !== VolumeSurface) {
                throw new Error(
                    "Items of option 'referencedVolume' must have type VolumeSurface."
                );
            }
            groupItem.ContentSequence.push(referencedVolume);
        } else if (options.referencedSegmentation !== undefined) {
            if (
                options.referencedSegmentation.constructor !==
                    ReferencedSegmentation &&
                options.referencedSegmentation.constructor !==
                    ReferencedSegmentationFrame
            ) {
                throw new Error(
                    "Option 'referencedSegmentation' must have type " +
                        "ReferencedSegmentation or ReferencedSegmentationFrame."
                );
            }
            groupItem.ContentSequence.push(referencedSegmentation);
        }
        this[0] = groupItem;
    }
}

class PlanarROIMeasurementsAndQualitativeEvaluations extends _ROIMeasurementsAndQualitativeEvaluations {
    constructor(options) {
        const wereReferencesProvided = [
            options.referencedRegion !== undefined,
            options.referencedSegmentation !== undefined
        ];
        const numReferences = wereReferencesProvided.reduce((a, b) => a + b);
        if (numReferences === 0) {
            throw new Error(
                "One of the following options must be provided: " +
                    "'referencedRegion', 'referencedSegmentation'."
            );
        } else if (numReferences > 1) {
            throw new Error(
                "Only one of the following options should be provided: " +
                    "'referencedRegion', 'referencedSegmentation'."
            );
        }
        super({
            trackingIdentifier: options.trackingIdentifier,
            referencedRegions: [options.referencedRegion],
            referencedSegmentation: options.referencedSegmentation,
            referencedRealWorldValueMap: options.referencedRealWorldValueMap,
            timePointContext: options.timePointContext,
            findingType: options.findingType,
            session: options.session,
            measurements: options.measurements,
            qualitativeEvaluations: options.qualitativeEvaluations
        });
    }
}

class VolumetricROIMeasurementsAndQualitativeEvaluations extends _ROIMeasurementsAndQualitativeEvaluations {
    constructor(options) {
        super({
            trackingIdentifier: options.trackingIdentifier,
            referencedRegions: options.referencedRegions,
            referencedSegmentation: options.referencedSegmentation,
            referencedRealWorldValueMap: options.referencedRealWorldValueMap,
            timePointContext: options.timePointContext,
            findingType: options.findingType,
            session: options.session,
            measurements: options.measurements,
            qualitativeEvaluations: options.qualitativeEvaluations
        });
    }
}

class MeasurementsDerivedFromMultipleROIMeasurements extends Template {
    constructor(options) {
        if (options.derivation === undefined) {
            throw new Error(
                "Option 'derivation' is required for " +
                    "MeasurementsDerivedFromMultipleROIMeasurements."
            );
        }
        // FIXME
        const valueItem = new NumContentItem({
            name: options.derivation
        });
        valueItem.ContentSequence = new ContentSequence();
        if (options.measurementGroups === undefined) {
            throw new Error(
                "Option 'measurementGroups' is required for " +
                    "MeasurementsDerivedFromMultipleROIMeasurements."
            );
        }
        if (
            !(
                typeof options.measurementGroups === "object" ||
                options.measurementGroups instanceof Array
            )
        ) {
            throw new Error("Option 'measurementGroups' must have type Array.");
        }
        options.measurementGroups.forEach(group => {
            if (
                !group ||
                (group.constructor !==
                    PlanarROIMeasurementsAndQualitativeEvaluations &&
                    group.constructor !==
                        VolumetricROIMeasurementsAndQualitativeEvaluations)
            ) {
                throw new Error(
                    "Items of option 'measurementGroups' must have type " +
                        "PlanarROIMeasurementsAndQualitativeEvaluations or " +
                        "VolumetricROIMeasurementsAndQualitativeEvaluations."
                );
            }
            group[0].RelationshipType = "R-INFERRED FROM";
            valueItem.ContentSequence.push(...group);
        });
        if (options.measurementProperties !== undefined) {
            if (
                options.measurementProperties.constructor !==
                MeasurementProperties
            ) {
                throw new Error(
                    "Option 'measurementProperties' must have type MeasurementProperties."
                );
            }
            valueItem.ContentSequence.push(...options.measurementProperties);
        }
        this.push(valueItem);
    }
}

class MeasurementAndQualitativeEvaluationGroup extends _MeasurementsAndQualitatitiveEvaluations {
    constructor(options) {
        super({
            trackingIdentifier: options.trackingIdentifier,
            referencedRealWorldValueMap: options.referencedRealWorldValueMap,
            timePointContext: options.timePointContext,
            findingType: options.findingType,
            session: options.session,
            measurements: options.measurements,
            qualitativeEvaluations: options.qualitativeEvaluations
        });
    }
}

class ROIMeasurements extends Template {
    constructor(options) {
        super();
        if (options.method !== undefined) {
            const methodItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "370129005",
                    meaning: "Measurement Method",
                    schemeDesignator: "SCT"
                }),
                value: options.method,
                relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
            });
            this.push(methodItem);
        }
        if (options.findingSites !== undefined) {
            if (
                !(
                    typeof options.findingSites === "object" ||
                    options.findingSites instanceof Array
                )
            ) {
                throw new Error("Option 'findingSites' must have type Array.");
            }
            options.findingSites.forEach(site => {
                if (!site || site.constructor !== FindingSite) {
                    throw new Error(
                        "Items of option 'findingSites' must have type FindingSite."
                    );
                }
                this.push(site);
            });
        }
        if (options.measurements === undefined) {
            throw new Error(
                "Options 'measurements' is required ROIMeasurements."
            );
        }
        if (
            !(
                typeof options.measurements === "object" ||
                options.measurements instanceof Array
            )
        ) {
            throw new Error("Option 'measurements' must have type Array.");
        }
        if (options.measurements.length === 0) {
            throw new Error("Option 'measurements' must have non-zero length.");
        }
        options.measurements.forEach(measurement => {
            if (!measurement || measurement.constructor !== Measurement) {
                throw new Error(
                    "Items of option 'measurements' must have type Measurement."
                );
            }
            this.push(measurement);
        });
    }
}

class MeasurementReport extends Template {
    constructor(options) {
        super();
        if (options.observationContext === undefined) {
            throw new Error(
                "Option 'observationContext' is required for MeasurementReport."
            );
        }
        if (options.procedureReported === undefined) {
            throw new Error(
                "Option 'procedureReported' is required for MeasurementReport."
            );
        }
        const item = new ContainerContentItem({
            name: new CodedConcept({
                value: "126000",
                schemeDesignator: "DCM",
                meaning: "Imaging Measurement Report"
            }),
            templateID: "1500"
        });
        item.ContentSequence = new ContentSequence();
        if (options.languageOfContentItemAndDescendants === undefined) {
            throw new Error(
                "Option 'languageOfContentItemAndDescendants' is required for " +
                    "MeasurementReport."
            );
        }
        if (
            options.languageOfContentItemAndDescendants.constructor !==
            LanguageOfContentItemAndDescendants
        ) {
            throw new Error(
                "Option 'languageOfContentItemAndDescendants' must have type " +
                    "LanguageOfContentItemAndDescendants."
            );
        }
        item.ContentSequence.push(
            ...options.languageOfContentItemAndDescendants
        );
        item.ContentSequence.push(...options.observationContext);
        if (
            options.procedureReported.constructor === CodedConcept ||
            options.procedureReported.constructor === Code
        ) {
            options.procedureReported = [options.procedureReported];
        }
        if (
            !(
                typeof options.procedureReported === "object" ||
                options.procedureReported instanceof Array
            )
        ) {
            throw new Error("Option 'procedureReported' must have type Array.");
        }
        options.procedureReported.forEach(procedure => {
            const procedureItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "121058",
                    meaning: "Procedure reported",
                    schemeDesignator: "DCM"
                }),
                value: procedure,
                relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
            });
            item.ContentSequence.push(procedureItem);
        });
        const imageLibraryItem = new ImageLibrary();
        item.ContentSequence.push(...imageLibraryItem);

        const wereOptionsProvided = [
            options.imagingMeasurements !== undefined,
            options.derivedImagingMeasurements !== undefined,
            options.qualitativeEvaluations !== undefined
        ];
        const numOptionsProvided = wereOptionsProvided.reduce((a, b) => a + b);
        if (numOptionsProvided > 1) {
            throw new Error(
                "Only one of the following options should be provided: " +
                    "'imagingMeasurements', 'derivedImagingMeasurement', " +
                    "'qualitativeEvaluations'."
            );
        }
        if (options.imagingMeasurements !== undefined) {
            const containerItem = new ContainerContentItem({
                name: new CodedConcept({
                    value: "126010",
                    meaning: "Imaging Measurements",
                    schemeDesignator: "DCM"
                }),
                relationshipType: RelationshipTypes.CONTAINS
            });
            containerItem.ContentSequence = new ContentSequence(
                ...options.imagingMeasurements
            );
            item.ContentSequence.push(containerItem);
        } else if (options.derivedImagingMeasurements !== undefined) {
            const containerItem = new ContainerContentItem({
                name: new CodedConcept({
                    value: "126011",
                    meaning: "Derived Imaging Measurements",
                    schemeDesignator: "DCM"
                }),
                relationshipType: RelationshipTypes.CONTAINS
            });
            containerItem.ContentSequence = new ContentSequence(
                ...options.derivedImagingMeasurements
            );
            item.ContentSequence.push(containerItem);
        } else if (options.qualitativeEvaluations !== undefined) {
            const containerItem = new ContainerContentItem({
                name: new CodedConcept({
                    value: "C0034375",
                    meaning: "Qualitative Evaluations",
                    schemeDesignator: "UMLS"
                }),
                relationshipType: RelationshipTypes.CONTAINS
            });
            containerItem.ContentSequence = new ContentSequence(
                ...options.qualitativeEvaluations
            );
            item.ContentSequence.push(containerItem);
        }
        this.push(item);
    }
}

class TimePointContext extends Template {
    constructor(options) {
        if (options.timePoint === undefined) {
            throw new Error(
                "Option 'timePoint' is required for TimePointContext."
            );
        }
        const timePointItem = new TextContentItem({
            name: new CodedConcept({
                value: "C2348792",
                meaning: "Time Point",
                schemeDesignator: "UMLS"
            }),
            value: options.timePoint,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.push(timePointItem);
        if (options.timePointType !== undefined) {
            const timePointTypeItem = new CodeContentItem({
                name: new CodedConcept({
                    value: "126072",
                    meaning: "Time Point Type",
                    schemeDesignator: "DCM"
                }),
                value: options.timePointType,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(timePointTypeItem);
        }
        if (options.timePointOrder !== undefined) {
            const timePointOrderItem = new NumContentItem({
                name: new CodedConcept({
                    value: "126073",
                    meaning: "Time Point Order",
                    schemeDesignator: "DCM"
                }),
                value: options.timePointOrder,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(timePointOrderItem);
        }
        if (options.subjectTimePointIdentifier !== undefined) {
            const subjectTimePointIdentifierItem = new NumContentItem({
                name: new CodedConcept({
                    value: "126070",
                    meaning: "Subject Time Point Identifier",
                    schemeDesignator: "DCM"
                }),
                value: options.subjectTimePointIdentifier,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(subjectTimePointIdentifierItem);
        }
        if (options.protocolTimePointIdentifier !== undefined) {
            const protocolTimePointIdentifierItem = new NumContentItem({
                name: new CodedConcept({
                    value: "126071",
                    meaning: "Protocol Time Point Identifier",
                    schemeDesignator: "DCM"
                }),
                value: options.protocolTimePointIdentifier,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(protocolTimePointIdentifierItem);
        }
        if (options.temporalOffsetFromEvent !== undefined) {
            if (
                options.temporalOffsetFromEvent.constructor !==
                LongitudinalTemporalOffsetFromEventContentItem
            ) {
                throw new Error(
                    "Option 'temporalOffsetFromEvent' must have type " +
                        "LongitudinalTemporalOffsetFromEventContentItem."
                );
            }
            this.push(temporalOffsetFromEvent);
        }
    }
}

class ImageLibrary extends Template {
    constructor(options) {
        super();
        const libraryItem = new ContainerContentItem({
            name: new CodedConcept({
                value: "111028",
                meaning: "Image Library",
                schemeDesignator: "DCM"
            }),
            relationshipType: RelationshipTypes.CONTAINS
        });
        this.push(libraryItem);
    }
}

class AlgorithmIdentification extends Template {
    constructor(options) {
        super();
        if (options.name === undefined) {
            throw new Error(
                "Option 'name' is required for AlgorithmIdentification."
            );
        }
        if (options.version === undefined) {
            throw new Error(
                "Option 'version' is required for AlgorithmIdentification."
            );
        }
        const nameItem = new TextContentItem({
            name: new CodedConcept({
                value: "111001",
                meaning: "Algorithm Name",
                schemeDesignator: "DCM"
            }),
            value: options.name,
            relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
        });
        this.push(nameItem);
        const versionItem = new TextContentItem({
            name: new CodedConcept({
                value: "111003",
                meaning: "Algorithm Version",
                schemeDesignator: "DCM"
            }),
            value: options.version,
            relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
        });
        this.push(versionItem);
        if (options.parameters !== undefined) {
            if (
                !(
                    typeof options.parameters === "object" ||
                    options.parameters instanceof Array
                )
            ) {
                throw new Error("Option 'parameters' must have type Array.");
            }
            options.parameters.forEach(parameter => {
                const parameterItem = new TextContentItem({
                    name: new CodedConcept({
                        value: "111002",
                        meaning: "Algorithm Parameter",
                        schemeDesignator: "DCM"
                    }),
                    value: param,
                    relationshipType: RelationshipTypes.HAS_CONCEPT_MOD
                });
                this.push(parameterItem);
            });
        }
    }
}

class TrackingIdentifier extends Template {
    constructor(options) {
        super();
        if (options.uid === undefined) {
            throw new Error("Option 'uid' is required for TrackingIdentifier.");
        }
        if (options.identifier !== undefined) {
            const trackingIdentifierItem = new TextContentItem({
                name: new CodedConcept({
                    value: "112039",
                    meaning: "Tracking Identifier",
                    schemeDesignator: "DCM"
                }),
                value: options.identifier,
                relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
            });
            this.push(trackingIdentifierItem);
        }
        const trackingUIDItem = new UIDRefContentItem({
            name: new CodedConcept({
                value: "112040",
                meaning: "Tracking Unique Identifier",
                schemeDesignator: "DCM"
            }),
            value: options.uid,
            relationshipType: RelationshipTypes.HAS_OBS_CONTEXT
        });
        this.push(trackingUIDItem);
    }
}

export {
    AlgorithmIdentification,
    DeviceObserverIdentifyingAttributes,
    ImageLibrary,
    LanguageOfContentItemAndDescendants,
    Measurement,
    MeasurementAndQualitativeEvaluationGroup,
    MeasurementReport,
    MeasurementsDerivedFromMultipleROIMeasurements,
    ObservationContext,
    ObserverContext,
    PersonObserverIdentifyingAttributes,
    PlanarROIMeasurementsAndQualitativeEvaluations,
    ROIMeasurements,
    SubjectContext,
    SubjectContextDevice,
    SubjectContextFetus,
    SubjectContextSpecimen,
    TimePointContext,
    TrackingIdentifier,
    VolumetricROIMeasurementsAndQualitativeEvaluations
    // MeasurementProperties,
    // MeasurementStatisticalProperties,
    // NormalRangeProperties,
    // EquationOrTable,
    // ImageOrSpatialCoordinates,
    // WaveformOrTemporalCoordinates,
    // Quotation,
};
