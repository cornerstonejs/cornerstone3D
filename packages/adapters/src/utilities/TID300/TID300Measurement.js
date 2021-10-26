import { DicomMetaDictionary } from "../../DicomMetaDictionary.js";

export default class TID300Measurement {
    constructor(props) {
        this.ReferencedSOPSequence = props.ReferencedSOPSequence;
        this.props = props;
    }

    getMeasurement(contentSequenceEntries) {
        return [
            ...this.getTrackingGroups(),
            ...this.getFindingGroup(),
            ...this.getFindingSiteGroups(),
            ...contentSequenceEntries
        ];
    }

    getTrackingGroups() {
        let { trackingIdentifierTextValue } = this.props;

        return [
            {
                RelationshipType: "HAS OBS CONTEXT",
                ValueType: "TEXT",
                ConceptNameCodeSequence: {
                    CodeValue: "112039",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Tracking Identifier"
                },
                TextValue: trackingIdentifierTextValue || "web annotation"
            },
            {
                RelationshipType: "HAS OBS CONTEXT",
                ValueType: "UIDREF",
                ConceptNameCodeSequence: {
                    CodeValue: "112040",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Tracking Unique Identifier"
                },
                UID: DicomMetaDictionary.uid()
            }
        ];
    }

    getFindingGroup() {
        let finding = this.props.finding;

        if (!finding) {
            return [];
        }

        const { CodeValue, CodingSchemeDesignator, CodeMeaning } = finding;

        return [
            {
                RelationshipType: "CONTAINS",
                ValueType: "CODE",
                ConceptNameCodeSequence: {
                    CodeValue: "121071",
                    CodingSchemeDesignator: "DCM",
                    CodeMeaning: "Finding"
                },
                ConceptCodeSequence: {
                    CodeValue, //: "SAMPLE FINDING",
                    CodingSchemeDesignator, //: "99dcmjs",
                    CodeMeaning //: "Sample Finding"
                }
            }
        ];
    }

    getFindingSiteGroups() {
        let findingSites = this.props.findingSites || [];

        return findingSites.map(findingSite => {
            const {
                CodeValue,
                CodingSchemeDesignator,
                CodeMeaning
            } = findingSite;
            return {
                RelationshipType: "CONTAINS",
                ValueType: "CODE",
                ConceptNameCodeSequence: {
                    CodeValue: "363698007",
                    CodingSchemeDesignator: "SCT",
                    CodeMeaning: "Finding Site"
                },
                ConceptCodeSequence: {
                    CodeValue, //: "SAMPLE FINDING SITE",
                    CodingSchemeDesignator, //: "99dcmjs",
                    CodeMeaning //: "Sample Finding Site"
                }
            };
        });
    }
}
