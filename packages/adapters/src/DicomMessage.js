import { ReadBufferStream } from "./BufferStream.js";
import { Tag } from "./Tag.js";
import { DicomMetaDictionary } from "./DicomMetaDictionary.js";
import { DicomDict } from "./DicomDict.js";
import { ValueRepresentation } from "./ValueRepresentation.js";

const IMPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2";
const EXPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";
const EXPLICIT_BIG_ENDIAN = "1.2.840.10008.1.2.2";
const singleVRs = ["SQ", "OF", "OW", "OB", "UN", "LT"];

const encodingMapping = {
    "iso-ir-192": "utf-8",
    "": "latin1"
};

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
    static read(
        bufferStream,
        syntax,
        ignoreErrors,
        untilTag = null,
        includeUntilTagValue = false
    ) {
        console.warn("DicomMessage.read to be deprecated after dcmjs 0.24.x");
        return this._read(bufferStream, syntax, {
            ignoreErrors: ignoreErrors,
            untilTag: untilTag,
            includeUntilTagValue: includeUntilTagValue
        });
    }

    static readTag(
        bufferStream,
        syntax,
        untilTag = null,
        includeUntilTagValue = false
    ) {
        console.warn(
            "DicomMessage.readTag to be deprecated after dcmjs 0.24.x"
        );
        return this._readTag(bufferStream, syntax, {
            untilTag: untilTag,
            includeUntilTagValue: includeUntilTagValue
        });
    }

    static _read(
        bufferStream,
        syntax,
        options = {
            ignoreErrors: false,
            untilTag: null,
            includeUntilTagValue: false
        }
    ) {
        const { ignoreErrors, untilTag } = options;
        var dict = {};
        try {
            while (!bufferStream.end()) {
                const readInfo = DicomMessage._readTag(
                    bufferStream,
                    syntax,
                    options
                );
                const cleanTagString = readInfo.tag.toCleanString();
                if (cleanTagString === "00080005") {
                    if (readInfo.values.length > 0) {
                        let coding = readInfo.values[0];
                        coding = coding
                            .replaceAll("_", "-")
                            .replaceAll(" ", "-")
                            .toLowerCase();
                        if (coding in encodingMapping) {
                            coding = encodingMapping[coding];
                        }
                        try {
                            bufferStream.setDecoder(new TextDecoder(coding));
                        } catch (error) {
                            console.warn(error);
                        }
                    }
                    if (readInfo.values.length > 1) {
                        console.warn(
                            "multiple encodings not supported, using first encoding!",
                            readInfo.values
                        );
                    }
                    readInfo.values = ["ISO_IR 192"]; // change SpecificCharacterSet to UTF-8
                }
                dict[cleanTagString] = {
                    vr: readInfo.vr.type,
                    Value: readInfo.values
                };

                if (untilTag && untilTag === cleanTagString) {
                    break;
                }
            }
            return dict;
        } catch (err) {
            if (ignoreErrors) {
                console.warn("WARN:", err);
                return dict;
            }
            throw err;
        }
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

    static readFile(
        buffer,
        options = {
            ignoreErrors: false,
            untilTag: null,
            includeUntilTagValue: false,
            noCopy: false
        }
    ) {
        var stream = new ReadBufferStream(buffer, null, {
                noCopy: options.noCopy
            }),
            useSyntax = EXPLICIT_LITTLE_ENDIAN;
        stream.reset();
        stream.increment(128);
        if (stream.readAsciiString(4) !== "DICM") {
            throw new Error("Invalid a dicom file");
        }
        var el = DicomMessage._readTag(stream, useSyntax),
            metaLength = el.values[0];

        //read header buffer
        var metaStream = stream.more(metaLength);

        var metaHeader = DicomMessage._read(metaStream, useSyntax, options);
        //get the syntax
        var mainSyntax = metaHeader["00020010"].Value[0];
        mainSyntax = DicomMessage._normalizeSyntax(mainSyntax);
        var objects = DicomMessage._read(stream, mainSyntax, options);

        var dicomDict = new DicomDict(metaHeader);
        dicomDict.dict = objects;

        return dicomDict;
    }

    static writeTagObject(stream, tagString, vr, values, syntax, writeOptions) {
        var tag = Tag.fromString(tagString);

        tag.write(stream, vr, values, syntax, writeOptions);
    }

    static write(jsonObjects, useStream, syntax, writeOptions) {
        var written = 0;

        var sortedTags = Object.keys(jsonObjects).sort();
        sortedTags.forEach(function (tagString) {
            var tag = Tag.fromString(tagString),
                tagObject = jsonObjects[tagString],
                vrType = tagObject.vr,
                values = tagObject.Value;

            written += tag.write(
                useStream,
                vrType,
                values,
                syntax,
                writeOptions
            );
        });

        return written;
    }

    static _readTag(
        stream,
        syntax,
        options = {
            untilTag: null,
            includeUntilTagValue: false
        }
    ) {
        const { untilTag, includeUntilTagValue } = options;
        var implicit = syntax == IMPLICIT_LITTLE_ENDIAN ? true : false,
            isLittleEndian =
                syntax == IMPLICIT_LITTLE_ENDIAN ||
                syntax == EXPLICIT_LITTLE_ENDIAN
                    ? true
                    : false;

        var oldEndian = stream.isLittleEndian;
        stream.setEndian(isLittleEndian);
        var tag = Tag.readTag(stream);

        if (untilTag === tag.toCleanString() && untilTag !== null) {
            if (!includeUntilTagValue) {
                return { tag: tag, vr: 0, values: 0 };
            }
        }

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
                } else if (tag.isPrivateCreator()) {
                    vrType = "LO";
                } else {
                    vrType = "UN";
                }
            }
            vr = ValueRepresentation.createByTypeString(vrType);
        } else {
            vrType = stream.readVR();
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
                values = val;
                if (typeof val === "string") {
                    values = val.split(String.fromCharCode(0x5c));
                }
            } else if (vr.type == "SQ") {
                values = val;
            } else if (vr.type == "OW" || vr.type == "OB") {
                values = val;
            } else {
                Array.isArray(val) ? (values = val) : values.push(val);
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
