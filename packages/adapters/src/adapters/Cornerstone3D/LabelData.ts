import type { Types } from "@cornerstonejs/tools";
import { COMMENT_CODE, TEXT_ANNOTATION_POSITION } from "./constants";
import { toScoord } from "../helpers";
import dcmjs from "dcmjs";

const {
    sr: { valueTypes, coding },
    adapters: { Cornerstone3D }
} = dcmjs;

/**
 * Wrap a dcmjs TID.1501 content item creator with a label text/position store
 * enhancements.
 * THis removes the incorrect label text encoding inside finding sites, and
 * adds it as a qualitative evaluation comment entry
 * As well, if the position is included, it will be encoded as an SCOORD entry
 * tagged to a private text annotation position value.
 */
export default class LabelData {
    protected tid300Item;
    protected annotation: Types.Annotation;
    public ReferencedSOPSequence;

    constructor(tid300Item, annotation: Types.Annotation) {
        this.tid300Item = tid300Item;
        this.annotation = annotation;
        this.ReferencedSOPSequence = tid300Item.ReferencedSOPSequence;
    }

    /**
     * This adds the additional information from the annotation data for
     * the label data.
     */
    public contentItem() {
        const contentEntries = this.tid300Item.contentItem();
        const { label, handles } = this.annotation.data;

        if (label) {
            contentEntries.push(this.createQualitativeLabel(label));
            this.filterCornerstoneFreeText(contentEntries);
        }
        if (handles?.textBox?.hasMoved) {
            contentEntries.push(
                this.createQualitativeLabelPosition(this.annotation)
            );
        }
        return contentEntries;
    }

    /**
     * Remove the incorrect finding sites entry for the text label.
     * Updated to support the new coding scheme with legacy fallback.
     */
    public filterCornerstoneFreeText(contentEntries) {
        const { codeValues } = Cornerstone3D.CodeScheme;

        const freeTextCodes = [
            codeValues.FREE_TEXT_CODE_VALUE,
            codeValues.CORNERSTONEFREETEXT // legacy support
        ];

        for (let i = 0; i < contentEntries.length; i++) {
            const group = contentEntries[i];
            if (!group.ConceptCodeSequence) {
                continue;
            }

            const csLabel = group.ConceptCodeSequence.findIndex(item =>
                freeTextCodes.includes(item.CodeValue)
            );

            if (csLabel !== -1) {
                group.ConceptCodeSequence.splice(csLabel, 1);
                if (group.ConceptCodeSequence.length === 0) {
                    contentEntries.splice(i, 1);
                }
                return;
            }
        }
    }

    /**
     * This is the standard TID.1501 method to create a qualitative label
     * comment.  It returns the DCM:121106 comment code with the text value
     * contained within the text.  This allows for comments of up to 2^32-4
     * characters
     */
    public createQualitativeLabel(label: string) {
        const relationshipType = valueTypes.RelationshipTypes.CONTAINS;
        return new valueTypes.TextContentItem({
            name: new coding.CodedConcept(COMMENT_CODE),
            relationshipType,
            value: label
        });
    }

    /**
     * Creates a qualitative evaluation text label position as an SCOORD (3D)
     * position labelled with the text annotation position indicator.
     */
    public createQualitativeLabelPosition(annotation: Types.Annotation) {
        const { textBox } = annotation.data.handles;
        const { referencedImageId, FrameOfReferenceUID: frameOfReferenceUID } =
            annotation.metadata;
        const is3DMeasurement = !referencedImageId;
        const { x, y, z } = toScoord(
            { is3DMeasurement, referencedImageId },
            textBox.worldPosition
        );

        const graphicType = valueTypes.GraphicTypes.POINT;
        const relationshipType = valueTypes.RelationshipTypes.CONTAINS;
        const name = new coding.CodedConcept(TEXT_ANNOTATION_POSITION);

        const scoord = is3DMeasurement
            ? new valueTypes.Scoord3DContentItem({
                  name,
                  relationshipType,
                  graphicType,
                  graphicData: [x, y, z],
                  frameOfReferenceUID
              })
            : new valueTypes.ScoordContentItem({
                  name,
                  relationshipType,
                  graphicType,
                  graphicData: [x, y]
              });

        // Required by TID 1501
        scoord.ContentSequence = [
            {
                RelationshipType: valueTypes.RelationshipTypes.SELECTED_FROM,
                ValueType: valueTypes.ValueTypes.IMAGE,
                ReferencedSOPSequence: this.ReferencedSOPSequence
            }
        ];

        return scoord;
    }
}
