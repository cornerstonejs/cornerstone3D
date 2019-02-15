import { ReadBufferStream } from "./BufferStream.js";
import { Tag } from "./Tag.js";
import { DicomMetaDictionary } from "./DicomMetaDictionary.js";
import { DicomDict } from "./DicomDict.js";
import { tagFromNumbers, ValueRepresentation } from "./ValueRepresentation.js";

const IMPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2";
const EXPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";
const EXPLICIT_BIG_ENDIAN = "1.2.840.10008.1.2.2";
const singleVRs = ["SQ", "OF", "OW", "OB", "UN"];

const encapsulatedSyntaxes = [
    "1.2.840.10008.1.2.4.50",
    "1.2.840.10008.1.2.4.51",
    "1.2.840.10008.1.2.4.57",
    "1.2.840.10008.1.2.4.70",
    "1.2.840.10008.1.2.4.80",
    "1.2.840.10008.1.2.4.81",
    "1.2.840.10008.1.2.4.90",
    "1.2.840.10008.1.2.4.91",
    "1.2.840.10008.1.2.4.92",
    "1.2.840.10008.1.2.4.93",
    "1.2.840.10008.1.2.4.94",
    "1.2.840.10008.1.2.4.95",
    "1.2.840.10008.1.2.5",
    "1.2.840.10008.1.2.6.1",
    "1.2.840.10008.1.2.4.100",
    "1.2.840.10008.1.2.4.102",
    "1.2.840.10008.1.2.4.103"
];

class DicomMessage {
    static read(bufferStream, syntax) {
        var dict = {};
        while (!bufferStream.end()) {
            var readInfo = DicomMessage.readTag(bufferStream, syntax);

            dict[readInfo.tag.toCleanString()] = {
                vr: readInfo.vr.type,
                Value: readInfo.values
            };
        }
        return dict;
    }

    static _normalizeSyntax(syntax) {
        if (
            syntax == IMPLICIT_LITTLE_ENDIAN ||
            syntax == EXPLICIT_LITTLE_ENDIAN ||
            syntax == EXPLICIT_BIG_ENDIAN
        ) {
            return syntax;
        } else {
            return EXPLICIT_LITTLE_ENDIAN;
        }
    }

    static isEncapsulated(syntax) {
        return encapsulatedSyntaxes.indexOf(syntax) != -1;
    }

    static readFile(buffer) {
        var stream = new ReadBufferStream(buffer),
            useSyntax = EXPLICIT_LITTLE_ENDIAN;
        stream.reset();
        stream.increment(128);
        if (stream.readString(4) != "DICM") {
            throw new Error("Invalid a dicom file");
        }
        var el = DicomMessage.readTag(stream, useSyntax),
            metaLength = el.values[0];

        //read header buffer
        var metaStream = stream.more(metaLength);

        var metaHeader = DicomMessage.read(metaStream, useSyntax);
        //get the syntax
        var mainSyntax = metaHeader["00020010"].Value[0];
        mainSyntax = DicomMessage._normalizeSyntax(mainSyntax);
        var objects = DicomMessage.read(stream, mainSyntax);

        var dicomDict = new DicomDict(metaHeader);
        dicomDict.dict = objects;

        return dicomDict;
    }

    static writeTagObject(stream, tagString, vr, values, syntax) {
        var tag = Tag.fromString(tagString);

        tag.write(stream, vr, values, syntax);
    }

    static write(jsonObjects, useStream, syntax) {
        var written = 0;

        var sortedTags = Object.keys(jsonObjects).sort();
        sortedTags.forEach(function(tagString) {
            var tag = Tag.fromString(tagString),
                tagObject = jsonObjects[tagString],
                vrType = tagObject.vr,
                values = tagObject.Value;

            written += tag.write(useStream, vrType, values, syntax);
        });

        return written;
    }

    static readTag(stream, syntax) {
        var implicit = syntax == IMPLICIT_LITTLE_ENDIAN ? true : false,
            isLittleEndian =
                syntax == IMPLICIT_LITTLE_ENDIAN ||
                syntax == EXPLICIT_LITTLE_ENDIAN
                    ? true
                    : false;

        var oldEndian = stream.isLittleEndian;
        stream.setEndian(isLittleEndian);
        var group = stream.readUint16(),
            element = stream.readUint16(),
            tag = tagFromNumbers(group, element);

        var length = null,
            vr = null,
            vrType;

        if (implicit) {
            length = stream.readUint32();
            var elementData = DicomMessage.lookupTag(tag);
            if (elementData) {
                vrType = elementData.vr;
            } else {
                //unknown tag
                if (length == 0xffffffff) {
                    vrType = "SQ";
                } else if (tag.isPixelDataTag()) {
                    vrType = "OW";
                } else if (vrType == "xs") {
                    vrType = "US";
                } else {
                    vrType = "UN";
                }
            }
            vr = ValueRepresentation.createByTypeString(vrType);
        } else {
            vrType = stream.readString(2);
            vr = ValueRepresentation.createByTypeString(vrType);
            if (vr.isExplicit()) {
                stream.increment(2);
                length = stream.readUint32();
            } else {
                length = stream.readUint16();
            }
        }

        var values = [];
        if (vr.isBinary() && length > vr.maxLength && !vr.noMultiple) {
            var times = length / vr.maxLength,
                i = 0;
            while (i++ < times) {
                values.push(vr.read(stream, vr.maxLength, syntax));
            }
        } else {
            var val = vr.read(stream, length, syntax);
            if (!vr.isBinary() && singleVRs.indexOf(vr.type) == -1) {
                values = val.split(String.fromCharCode(0x5c));
            } else if (vr.type == "SQ") {
                values = val;
            } else if (vr.type == "OW" || vr.type == "OB") {
                values = val;
            } else {
                values.push(val);
            }
        }
        stream.setEndian(oldEndian);

        return { tag: tag, vr: vr, values: values };
    }

    static lookupTag(tag) {
        return DicomMetaDictionary.dictionary[tag.toString()];
    }
}

export { DicomMessage };
