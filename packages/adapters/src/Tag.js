import { ValueRepresentation } from "./ValueRepresentation.js";
import { DicomMessage } from "./DicomMessage.js";
import { WriteBufferStream } from "./BufferStream.js";

var IMPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2";
var EXPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";

function paddingLeft(paddingValue, string) {
    return String(paddingValue + string).slice(-paddingValue.length);
}

class Tag {
    constructor(value) {
        this.value = value;
    }

    toString() {
        return (
            "(" +
            paddingLeft("0000", this.group().toString(16).toUpperCase()) +
            "," +
            paddingLeft("0000", this.element().toString(16).toUpperCase()) +
            ")"
        );
    }

    toCleanString() {
        return (
            paddingLeft("0000", this.group().toString(16).toUpperCase()) +
            paddingLeft("0000", this.element().toString(16).toUpperCase())
        );
    }

    is(t) {
        return this.value == t;
    }

    group() {
        return this.value >>> 16;
    }

    element() {
        return this.value & 0xffff;
    }

    isPixelDataTag() {
        return this.is(0x7fe00010);
    }

    isPrivateCreator() {
        const group = this.group();
        const element = this.element();
        return group % 2 === 1 && element < 0x100 && element > 0x00;
    }

    static fromString(str) {
        var group = parseInt(str.substring(0, 4), 16),
            element = parseInt(str.substring(4), 16);
        return Tag.fromNumbers(group, element);
    }

    static fromPString(str) {
        var group = parseInt(str.substring(1, 5), 16),
            element = parseInt(str.substring(6, 10), 16);
        return Tag.fromNumbers(group, element);
    }

    static fromNumbers(group, element) {
        return new Tag(((group << 16) | element) >>> 0);
    }

    static readTag(stream) {
        var group = stream.readUint16(),
            element = stream.readUint16();
        return Tag.fromNumbers(group, element);
    }

    write(stream, vrType, values, syntax, writeOptions) {
        var vr = ValueRepresentation.createByTypeString(vrType),
            useSyntax = DicomMessage._normalizeSyntax(syntax);

        var implicit = useSyntax == IMPLICIT_LITTLE_ENDIAN ? true : false,
            isLittleEndian =
                useSyntax == IMPLICIT_LITTLE_ENDIAN ||
                useSyntax == EXPLICIT_LITTLE_ENDIAN
                    ? true
                    : false,
            isEncapsulated =
                this.isPixelDataTag() && DicomMessage.isEncapsulated(syntax);

        var oldEndian = stream.isLittleEndian;
        stream.setEndian(isLittleEndian);

        stream.writeUint16(this.group());
        stream.writeUint16(this.element());

        var tagStream = new WriteBufferStream(256),
            valueLength;
        tagStream.setEndian(isLittleEndian);

        if (vrType == "OW" || vrType == "OB" || vrType == "UN") {
            valueLength = vr.writeBytes(
                tagStream,
                values,
                useSyntax,
                isEncapsulated,
                writeOptions
            );
        } else if (vrType == "SQ") {
            valueLength = vr.writeBytes(
                tagStream,
                values,
                useSyntax,
                writeOptions
            );
        } else {
            valueLength = vr.writeBytes(tagStream, values, writeOptions);
        }

        if (vrType == "SQ") {
            valueLength = 0xffffffff;
        }
        var written = tagStream.size + 4;

        if (implicit) {
            stream.writeUint32(valueLength);
            written += 4;
        } else {
            if (vr.isExplicit()) {
                stream.writeAsciiString(vr.type);
                stream.writeUint16(0);
                stream.writeUint32(valueLength);
                written += 8;
            } else {
                stream.writeAsciiString(vr.type);
                stream.writeUint16(valueLength);
                written += 4;
            }
        }

        stream.concat(tagStream);

        stream.setEndian(oldEndian);

        return written;
    }
}

export { Tag };
