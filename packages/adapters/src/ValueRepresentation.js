import log from "./log.js";
import { DicomMessage } from "./DicomMessage.js";
import { ReadBufferStream } from "./BufferStream.js";
import { WriteBufferStream } from "./BufferStream.js";
import { Tag } from "./Tag.js";

function paddingLeft(paddingValue, string) {
    return String(paddingValue + string).slice(-paddingValue.length);
}

function rtrim(str) {
    return str.replace(/\s*$/g, "");
}

function tagFromNumbers(group, element) {
    return new Tag(((group << 16) | element) >>> 0);
}

function readTag(stream) {
    var group = stream.readUint16(),
        element = stream.readUint16();

    var tag = tagFromNumbers(group, element);
    return tag;
}

function toWindows(inputArray, size) {
    return Array.from(
        { length: inputArray.length - (size - 1) }, //get the appropriate length
        (_, index) => inputArray.slice(index, index + size) //create the windows
    );
}

var binaryVRs = ["FL", "FD", "SL", "SS", "UL", "US", "AT"],
    explicitVRs = ["OB", "OW", "OF", "SQ", "UC", "UR", "UT", "UN"],
    singleVRs = ["SQ", "OF", "OW", "OB", "UN"];

class ValueRepresentation {
    constructor(type) {
        this.type = type;
        this.multi = false;
    }

    isBinary() {
        return binaryVRs.indexOf(this.type) != -1;
    }

    allowMultiple() {
        return !this.isBinary() && singleVRs.indexOf(this.type) == -1;
    }

    isExplicit() {
        return explicitVRs.indexOf(this.type) != -1;
    }

    read(stream, length, syntax) {
        if (this.fixed && this.maxLength) {
            if (!length) return this.defaultValue;
            if (this.maxLength != length)
                log.error(
                    "Invalid length for fixed length tag, vr " +
                        this.type +
                        ", length " +
                        this.maxLength +
                        " != " +
                        length
                );
        }
        return this.readBytes(stream, length, syntax);
    }

    readBytes(stream, length) {
        return stream.readString(length);
    }

    readNullPaddedString(stream, length) {
        if (!length) return "";

        var str = stream.readString(length - 1);
        if (stream.readUint8() != 0) {
            stream.increment(-1);
            str += stream.readString(1);
        }
        return str;
    }

    writeFilledString(stream, value, length) {
        if (length < this.maxLength && length >= 0) {
            var written = 0;
            if (length > 0) written += stream.writeString(value);
            var zeroLength = this.maxLength - length;
            written += stream.writeHex(this.fillWith.repeat(zeroLength));
            return written;
        } else if (length == this.maxLength) {
            return stream.writeString(value);
        } else {
            throw "Length mismatch";
        }
    }

    write(stream, type) {
        var args = Array.from(arguments);
        if (args[2] === null || args[2] === "" || args[2] === undefined) {
            return [stream.writeString("")];
        } else {
            var written = [],
                valueArgs = args.slice(2),
                func = stream["write" + type];
            if (Array.isArray(valueArgs[0])) {
                if (valueArgs[0].length < 1) {
                    written.push(0);
                } else {
                    var self = this;
                    valueArgs[0].forEach(function (v, k) {
                        if (self.allowMultiple() && k > 0) {
                            stream.writeHex("5C");
                            //byteCount++;
                        }
                        var singularArgs = [v].concat(valueArgs.slice(1));
                        var byteCount = func.apply(stream, singularArgs);
                        written.push(byteCount);
                    });
                }
            } else {
                written.push(func.apply(stream, valueArgs));
            }
            return written;
        }
    }

    writeBytes(
        stream,
        value,
        lengths,
        writeOptions = { allowInvalidVRLength: false }
    ) {
        const { allowInvalidVRLength } = writeOptions;
        var valid = true,
            valarr = Array.isArray(value) ? value : [value],
            total = 0;

        for (var i = 0; i < valarr.length; i++) {
            var checkValue = valarr[i],
                checklen = lengths[i],
                isString = false,
                displaylen = checklen;
            if (checkValue === null || allowInvalidVRLength) {
                valid = true;
            } else if (this.checkLength) {
                valid = this.checkLength(checkValue);
            } else if (this.maxCharLength) {
                var check = this.maxCharLength; //, checklen = checkValue.length;
                valid = checkValue.length <= check;
                displaylen = checkValue.length;
                isString = true;
            } else if (this.maxLength) {
                valid = checklen <= this.maxLength;
            }

            if (!valid) {
                var errmsg =
                    "Value exceeds max length, vr: " +
                    this.type +
                    ", value: " +
                    checkValue +
                    ", length: " +
                    displaylen;
                if (isString) log.log(errmsg);
                else throw new Error(errmsg);
            }
            total += checklen;
        }
        if (this.allowMultiple()) {
            total += valarr.length ? valarr.length - 1 : 0;
        }

        //check for odd
        var written = total;
        if (total & 1) {
            stream.writeHex(this.padByte);
            written++;
        }
        return written;
    }

    static createByTypeString(type) {
        var vr = null;
        if (type == "AE") vr = new ApplicationEntity();
        else if (type == "AS") vr = new AgeString();
        else if (type == "AT") vr = new AttributeTag();
        else if (type == "CS") vr = new CodeString();
        else if (type == "DA") vr = new DateValue();
        else if (type == "DS") vr = new DecimalString();
        else if (type == "DT") vr = new DateTime();
        else if (type == "FL") vr = new FloatingPointSingle();
        else if (type == "FD") vr = new FloatingPointDouble();
        else if (type == "IS") vr = new IntegerString();
        else if (type == "LO") vr = new LongString();
        else if (type == "LT") vr = new LongText();
        else if (type == "OB") vr = new OtherByteString();
        else if (type == "OD") vr = new OtherDoubleString();
        else if (type == "OF") vr = new OtherFloatString();
        else if (type == "OW") vr = new OtherWordString();
        else if (type == "PN") vr = new PersonName();
        else if (type == "SH") vr = new ShortString();
        else if (type == "SL") vr = new SignedLong();
        else if (type == "SQ") vr = new SequenceOfItems();
        else if (type == "SS") vr = new SignedShort();
        else if (type == "ST") vr = new ShortText();
        else if (type == "TM") vr = new TimeValue();
        else if (type == "UC") vr = new UnlimitedCharacters();
        else if (type == "UI") vr = new UniqueIdentifier();
        else if (type == "UL") vr = new UnsignedLong();
        else if (type == "UN") vr = new UnknownValue();
        else if (type == "UR") vr = new UniversalResource();
        else if (type == "US") vr = new UnsignedShort();
        else if (type == "UT") vr = new UnlimitedText();
        else if (type == "ox") {
            // TODO: determine VR based on context (could be 1 byte pixel data)
            // https://github.com/dgobbi/vtk-dicom/issues/38
            log.error("Invalid vr type " + type + " - using OW");
            vr = new OtherWordString();
        } else if (type == "xs") {
            log.error("Invalid vr type " + type + " - using US");
            vr = new UnsignedShort();
        } else {
            log.error("Invalid vr type " + type + " - using UN");
            vr = new UnknownValue();
        }

        return vr;
    }
}

class StringRepresentation extends ValueRepresentation {
    constructor(type) {
        super(type);
    }

    readBytes(stream, length) {
        return stream.readString(length);
    }

    writeBytes(stream, value, writeOptions) {
        // TODO will delete
        if (!writeOptions) throw new Error("writeOptions is undefined");
        const written = super.write(stream, "String", value);

        return super.writeBytes(stream, value, written, writeOptions);
    }
}

class BinaryRepresentation extends ValueRepresentation {
    constructor(type) {
        super(type);
    }

    writeBytes(stream, value, syntax, isEncapsulated, writeOptions = {}) {
        var i;
        var binaryStream;
        var { fragmentMultiframe = true } = writeOptions;
        value = value === null || value === undefined ? [] : value;
        if (isEncapsulated) {
            var fragmentSize = 1024 * 20,
                frames = value.length,
                startOffset = [];

            // Calculate a total length for storing binary stream
            var bufferLength = 0;
            for (i = 0; i < frames; i++) {
                bufferLength += value[i].byteLength;
                let fragmentsLength = 1;
                if (fragmentMultiframe) {
                    fragmentsLength = Math.ceil(
                        value[i].byteLength / fragmentSize
                    );
                }
                // 8 bytes per fragment are needed to store 0xffff (2 bytes), 0xe000 (2 bytes), and frageStream size (4 bytes)
                bufferLength += fragmentsLength * 8;
            }

            binaryStream = new WriteBufferStream(
                bufferLength,
                stream.isLittleEndian
            );

            for (i = 0; i < frames; i++) {
                startOffset.push(binaryStream.size);
                var frameBuffer = value[i],
                    frameStream = new ReadBufferStream(frameBuffer);

                var fragmentsLength = 1;
                if (fragmentMultiframe) {
                    fragmentsLength = Math.ceil(
                        frameStream.size / fragmentSize
                    );
                }

                for (var j = 0, fragmentStart = 0; j < fragmentsLength; j++) {
                    var fragmentEnd = fragmentStart + frameStream.size;
                    if (fragmentMultiframe) {
                        fragmentEnd = fragmentStart + fragmentSize;
                    }
                    if (j == fragmentsLength - 1) {
                        fragmentEnd = frameStream.size;
                    }
                    var fragStream = new ReadBufferStream(
                        frameStream.getBuffer(fragmentStart, fragmentEnd)
                    );
                    fragmentStart = fragmentEnd;
                    binaryStream.writeUint16(0xfffe);
                    binaryStream.writeUint16(0xe000);
                    binaryStream.writeUint32(fragStream.size);
                    binaryStream.concat(fragStream);
                }
            }

            stream.writeUint16(0xfffe);
            stream.writeUint16(0xe000);
            stream.writeUint32(startOffset.length * 4);
            for (i = 0; i < startOffset.length; i++) {
                stream.writeUint32(startOffset[i]);
            }
            stream.concat(binaryStream);
            stream.writeUint16(0xfffe);
            stream.writeUint16(0xe0dd);
            stream.writeUint32(0x0);
            var written = 8 + binaryStream.size + startOffset.length * 4 + 8;
            if (written & 1) {
                stream.writeHex(this.padByte);
                written++;
            }

            return 0xffffffff;
        } else {
            var binaryData = value[0];
            binaryStream = new ReadBufferStream(binaryData);
            stream.concat(binaryStream);
            return super.writeBytes(
                stream,
                binaryData,
                [binaryStream.size],
                writeOptions
            );
        }
    }

    readBytes(stream, length) {
        if (length == 0xffffffff) {
            var itemTagValue = Tag.readTag(stream),
                frames = [];

            if (itemTagValue.is(0xfffee000)) {
                var itemLength = stream.readUint32(),
                    numOfFrames = 1,
                    offsets = [];
                if (itemLength > 0x0) {
                    //has frames
                    numOfFrames = itemLength / 4;
                    var i = 0;
                    while (i++ < numOfFrames) {
                        offsets.push(stream.readUint32());
                    }
                } else {
                    offsets = [];
                }

                const getFrameOrFragement = stream => {
                    var nextTag = Tag.readTag(stream);
                    if (!nextTag.is(0xfffee000)) {
                        return [null, true];
                    }
                    let frameOrFragmentItemLength = stream.readUint32();
                    const buffer = stream.getBuffer(
                        stream.offset,
                        stream.offset + frameOrFragmentItemLength
                    );
                    stream.increment(frameOrFragmentItemLength);
                    return [buffer, false];
                };

                // If there is an offset table, use that to loop through pixel data sequence
                if (offsets.length > 0) {
                    // make offsets relative to the stream, not tag
                    offsets = offsets.map(e => e + stream.offset);
                    offsets.push(stream.size);

                    // window offsets to an array of [start,stop] locations
                    frames = toWindows(offsets, 2).map(range => {
                        const fragments = [];
                        const [start, stop] = range;
                        // create a new readable stream based on the range
                        const s = new ReadBufferStream(
                            stream.buffer,
                            stream.isLittleEndian,
                            start,
                            stop
                        );
                        while (!s.end()) {
                            const [buf, done] = getFrameOrFragement(s);
                            if (done) {
                                break;
                            }
                            fragments.push(buf);
                        }
                        return fragments;
                    });

                    frames = frames.map(fragments => {
                        if (fragments.length < 1) {
                            return fragments[0];
                        } else {
                            const frameSize = fragments.reduce(
                                (size, buffer) => {
                                    return size + buffer.byteLength;
                                },
                                0
                            );
                            const mergedFrame = new Uint8Array(frameSize);
                            fragments.reduce((offset, buffer) => {
                                mergedFrame.set(new Uint8Array(buffer), offset);
                                return offset + buffer.byteLength;
                            }, 0);
                            return mergedFrame;
                        }
                    });
                }
                // If no offset table, loop through remainder of stream looking for termination tag
                else {
                    while (stream.offset < stream.size) {
                        const [buffer, done] = getFrameOrFragement(stream);
                        if (done) break;
                        frames.push(buffer);
                    }
                }

                // Read SequenceDelimitationItem Tag
                stream.readUint32();
                // Read SequenceDelimitationItem value.
                if (stream.size - stream.offset >= 4) {
                    stream.readUint32();
                }
            } else {
                throw new Error(
                    "Item tag not found after undefined binary length"
                );
            }
            return frames;
        } else {
            var bytes;
            /*if (this.type == 'OW') {
                bytes = stream.readUint16Array(length);
            } else if (this.type == 'OB') {
                bytes = stream.readUint8Array(length);
            }*/
            bytes = stream.getBuffer(stream.offset, stream.offset + length);
            stream.increment(length);
            return [bytes];
        }
    }
}

class ApplicationEntity extends StringRepresentation {
    constructor() {
        super("AE");
        this.maxLength = 16;
        this.padByte = "20";
        this.fillWith = "20";
    }

    readBytes(stream, length) {
        return stream.readString(length).trim();
    }
}

class CodeString extends StringRepresentation {
    constructor() {
        super("CS");
        this.maxLength = 16;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        //return this.readNullPaddedString(stream, length).trim();
        return stream.readString(length).trim();
    }
}

class AgeString extends StringRepresentation {
    constructor() {
        super("AS");
        this.maxLength = 4;
        this.padByte = "20";
        this.fixed = true;
        this.defaultValue = "";
    }
}

class AttributeTag extends ValueRepresentation {
    constructor() {
        super("AT");
        this.maxLength = 4;
        this.valueLength = 4;
        this.padByte = "00";
        this.fixed = true;
    }

    readBytes(stream) {
        var group = stream.readUint16(),
            element = stream.readUint16();
        return tagFromNumbers(group, element).value;
    }

    writeBytes(stream, value, writeOptions) {
        return super.writeBytes(
            stream,
            value,
            super.write(stream, "TwoUint16s", value),
            writeOptions
        );
    }
}

class DateValue extends StringRepresentation {
    constructor(value) {
        super("DA", value);
        this.maxLength = 18;
        this.padByte = "20";
        //this.fixed = true;
        this.defaultValue = "";
    }
}

class DecimalString extends StringRepresentation {
    constructor() {
        super("DS");
        this.maxLength = 16;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        const BACKSLASH = String.fromCharCode(0x5c);
        //return this.readNullPaddedString(stream, length).trim();
        let ds = stream.readString(length);
        ds = ds.replace(/[^0-9.\\\-+e]/gi, "");
        if (ds.indexOf(BACKSLASH) !== -1) {
            // handle decimal string with multiplicity
            const dsArray = ds.split(BACKSLASH);
            ds = dsArray.map(ds => (ds === "" ? null : Number(ds)));
        } else {
            ds = [ds === "" ? null : Number(ds)];
        }

        return ds;
    }

    formatValue(value) {
        if (value === null) {
            return "";
        }

        const str = String(value);
        if (str.length > this.maxLength) {
            return value.toExponential();
        }
        return str;
    }

    writeBytes(stream, value, writeOptions) {
        const val = Array.isArray(value)
            ? value.map(ds => this.formatValue(ds))
            : [this.formatValue(value)];
        return super.writeBytes(stream, val, writeOptions);
    }
}

class DateTime extends StringRepresentation {
    constructor() {
        super("DT");
        this.maxLength = 26;
        this.padByte = "20";
    }
}

class FloatingPointSingle extends ValueRepresentation {
    constructor() {
        super("FL");
        this.maxLength = 4;
        this.padByte = "00";
        this.fixed = true;
        this.defaultValue = 0.0;
    }

    readBytes(stream) {
        return Number(stream.readFloat());
    }

    writeBytes(stream, value, writeOptions) {
        return super.writeBytes(
            stream,
            value,
            super.write(stream, "Float", value),
            writeOptions
        );
    }
}

class FloatingPointDouble extends ValueRepresentation {
    constructor() {
        super("FD");
        this.maxLength = 8;
        this.padByte = "00";
        this.fixed = true;
        this.defaultValue = 0.0;
    }

    readBytes(stream) {
        return Number(stream.readDouble());
    }

    writeBytes(stream, value, writeOptions) {
        return super.writeBytes(
            stream,
            value,
            super.write(stream, "Double", value),
            writeOptions
        );
    }
}

class IntegerString extends StringRepresentation {
    constructor() {
        super("IS");
        this.maxLength = 12;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        const BACKSLASH = String.fromCharCode(0x5c);
        let is = stream.readString(length).trim();

        is = is.replace(/[^0-9.\\\-+e]/gi, "");

        if (is.indexOf(BACKSLASH) !== -1) {
            // handle integer string with multiplicity
            const integerStringArray = is.split(BACKSLASH);
            is = integerStringArray.map(is => (is === "" ? null : Number(is)));
        } else {
            is = [is === "" ? null : Number(is)];
        }

        return is;
    }

    formatValue(value) {
        return value === null ? "" : String(value);
    }

    writeBytes(stream, value, writeOptions) {
        const val = Array.isArray(value)
            ? value.map(is => this.formatValue(is))
            : [this.formatValue(value)];
        return super.writeBytes(stream, val, writeOptions);
    }
}

class LongString extends StringRepresentation {
    constructor() {
        super("LO");
        this.maxCharLength = 64;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        //return this.readNullPaddedString(stream, length).trim();
        return stream.readString(length).trim();
    }
}

class LongText extends StringRepresentation {
    constructor() {
        super("LT");
        this.maxCharLength = 10240;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        //return rtrim(this.readNullPaddedString(stream, length));
        return rtrim(stream.readString(length));
    }
}

class PersonName extends StringRepresentation {
    constructor() {
        super("PN");
        this.maxLength = null;
        this.padByte = "20";
    }

    checkLength(value) {
        var components = [];
        if (typeof value === "object" && value !== null) {
            // In DICOM JSON, components are encoded as a mapping (object),
            // where the keys are one or more of the following: "Alphabetic",
            // "Ideographic", "Phonetic".
            // http://dicom.nema.org/medical/dicom/current/output/chtml/part18/sect_F.2.2.html
            components = Object.keys(value).forEach(key => value[key]);
        } else if (typeof value === "string" || value instanceof String) {
            // In DICOM Part10, components are encoded as a string,
            // where components ("Alphabetic", "Ideographic", "Phonetic")
            // are separated by the "=" delimeter.
            // http://dicom.nema.org/medical/dicom/current/output/chtml/part05/sect_6.2.html
            components = value.split(/\=/);
        }
        for (var i in components) {
            var cmp = components[i];
            if (cmp.length > 64) return false;
        }
        return true;
    }

    readBytes(stream, length) {
        //return rtrim(this.readNullPaddedString(stream, length));
        return rtrim(stream.readString(length));
    }
}

class ShortString extends StringRepresentation {
    constructor() {
        super("SH");
        this.maxCharLength = 16;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        //return this.readNullPaddedString(stream, length).trim();
        return stream.readString(length).trim();
    }
}

class SignedLong extends ValueRepresentation {
    constructor() {
        super("SL");
        this.maxLength = 4;
        this.padByte = "00";
        this.fixed = true;
        this.defaultValue = 0;
    }

    readBytes(stream) {
        return stream.readInt32();
    }

    writeBytes(stream, value, writeOptions) {
        return super.writeBytes(
            stream,
            value,
            super.write(stream, "Int32", value),
            writeOptions
        );
    }
}

class SequenceOfItems extends ValueRepresentation {
    constructor() {
        super("SQ");
        this.maxLength = null;
        this.padByte = "00";
        this.noMultiple = true;
    }

    readBytes(stream, sqlength, syntax) {
        if (sqlength == 0x0) {
            return []; //contains no dataset
        } else {
            var undefLength = sqlength == 0xffffffff,
                elements = [],
                read = 0;

            /* eslint-disable-next-line no-constant-condition */
            while (true) {
                var tag = readTag(stream),
                    length = null;
                read += 4;

                if (tag.is(0xfffee0dd)) {
                    stream.readUint32();
                    break;
                } else if (!undefLength && read == sqlength) {
                    break;
                } else if (tag.is(0xfffee000)) {
                    length = stream.readUint32();
                    read += 4;
                    var itemStream = null,
                        toRead = 0,
                        undef = length == 0xffffffff;

                    if (undef) {
                        var stack = 0;

                        /* eslint-disable-next-line no-constant-condition */
                        while (1) {
                            var g = stream.readUint16();
                            if (g == 0xfffe) {
                                // some control tag is about to be read
                                var ge = stream.readUint16();
                                if (ge == 0xe00d) {
                                    // item delimitation tag has been read
                                    stack--;
                                    if (stack < 0) {
                                        // if we are outside every stack, then we are finished reading the sequence of items
                                        stream.increment(4);
                                        read += 8;
                                        break;
                                    } else {
                                        // otherwise, we were in a nested sequence of items
                                        toRead += 4;
                                    }
                                } else if (ge == 0xe000) {
                                    // a new item has been found
                                    stack++;
                                    toRead += 4;
                                    var itemLength = stream.readUint32();
                                    stream.increment(-4);
                                    if (itemLength === 0) {
                                        // in some odd cases, DICOMs rely on the length being zero to denote that the item has closed
                                        stack--;
                                    }
                                } else {
                                    // some control tag that does not concern sequence of items has been read
                                    toRead += 2;
                                    stream.increment(-2);
                                }
                            } else {
                                // anything else has been read
                                toRead += 2;
                            }
                        }
                    } else {
                        toRead = length;
                    }

                    if (toRead) {
                        stream.increment(undef ? -toRead - 8 : 0);
                        itemStream = stream.more(toRead); //parseElements
                        read += toRead;
                        if (undef) stream.increment(8);

                        var items = DicomMessage.read(itemStream, syntax);
                        elements.push(items);
                    }
                    if (!undefLength && read == sqlength) {
                        break;
                    }
                }
            }
            return elements;
        }
    }

    writeBytes(stream, value, syntax, writeOptions) {
        let written = 0;

        if (value) {
            for (var i = 0; i < value.length; i++) {
                var item = value[i];
                super.write(stream, "Uint16", 0xfffe);
                super.write(stream, "Uint16", 0xe000);
                super.write(stream, "Uint32", 0xffffffff);

                written += DicomMessage.write(
                    item,
                    stream,
                    syntax,
                    writeOptions
                );

                super.write(stream, "Uint16", 0xfffe);
                super.write(stream, "Uint16", 0xe00d);
                super.write(stream, "Uint32", 0x00000000);
                written += 16;
            }
        }
        super.write(stream, "Uint16", 0xfffe);
        super.write(stream, "Uint16", 0xe0dd);
        super.write(stream, "Uint32", 0x00000000);
        written += 8;

        return super.writeBytes(stream, value, [written], writeOptions);
    }
}

class SignedShort extends ValueRepresentation {
    constructor() {
        super("SS");
        this.maxLength = 2;
        this.valueLength = 2;
        this.padByte = "00";
        this.fixed = true;
        this.defaultValue = 0;
    }

    readBytes(stream) {
        return stream.readInt16();
    }

    writeBytes(stream, value, writeOptions) {
        return super.writeBytes(
            stream,
            value,
            super.write(stream, "Int16", value),
            writeOptions
        );
    }
}

class ShortText extends StringRepresentation {
    constructor() {
        super("ST");
        this.maxCharLength = 1024;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        //return rtrim(this.readNullPaddedString(stream, length));
        return rtrim(stream.readString(length));
    }
}

class TimeValue extends StringRepresentation {
    constructor() {
        super("TM");
        this.maxLength = 14;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        return rtrim(stream.readString(length));
    }
}

class UnlimitedCharacters extends StringRepresentation {
    constructor() {
        super("UC");
        this.maxLength = null;
        this.multi = true;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        return rtrim(stream.readString(length));
    }
}

class UnlimitedText extends StringRepresentation {
    constructor() {
        super("UT");
        this.maxLength = null;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        //return this.readNullPaddedString(stream, length);
        return rtrim(stream.readString(length));
    }
}

class UnsignedShort extends ValueRepresentation {
    constructor() {
        super("US");
        this.maxLength = 2;
        this.padByte = "00";
        this.fixed = true;
        this.defaultValue = 0;
    }

    readBytes(stream) {
        return stream.readUint16();
    }

    writeBytes(stream, value, writeOptions) {
        return super.writeBytes(
            stream,
            value,
            super.write(stream, "Uint16", value),
            writeOptions
        );
    }
}

class UnsignedLong extends ValueRepresentation {
    constructor() {
        super("UL");
        this.maxLength = 4;
        this.padByte = "00";
        this.fixed = true;
        this.defaultValue = 0;
    }

    readBytes(stream) {
        return stream.readUint32();
    }

    writeBytes(stream, value, writeOptions) {
        return super.writeBytes(
            stream,
            value,
            super.write(stream, "Uint32", value),
            writeOptions
        );
    }
}

class UniqueIdentifier extends StringRepresentation {
    constructor() {
        super("UI");
        this.maxLength = 64;
        this.padByte = "00";
    }

    readBytes(stream, length) {
        const result = this.readNullPaddedString(stream, length);

        const BACKSLASH = String.fromCharCode(0x5c);
        const uidRegExp = /[^0-9.]/g;

        // Treat backslashes as a delimiter for multiple UIDs, in which case an
        // array of UIDs is returned. This is used by DICOM Q&R to support
        // querying and matching multiple items on a UID field in a single
        // query. For more details see:
        //
        // https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_C.2.2.2.2.html
        // https://dicom.nema.org/medical/dicom/current/output/chtml/part05/sect_6.4.html

        if (result.indexOf(BACKSLASH) === -1) {
            return result.replace(uidRegExp, "");
        } else {
            return result
                .split(BACKSLASH)
                .map(uid => uid.replace(uidRegExp, ""));
        }
    }
}

class UniversalResource extends StringRepresentation {
    constructor() {
        super("UR");
        this.maxLength = null;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        return stream.readString(length);
    }
}

class UnknownValue extends BinaryRepresentation {
    constructor() {
        super("UN");
        this.maxLength = null;
        this.padByte = "00";
        this.noMultiple = true;
    }
}

class OtherWordString extends BinaryRepresentation {
    constructor() {
        super("OW");
        this.maxLength = null;
        this.padByte = "00";
        this.noMultiple = true;
    }
}

class OtherByteString extends BinaryRepresentation {
    constructor() {
        super("OB");
        this.maxLength = null;
        this.padByte = "00";
        this.noMultiple = true;
    }
}

class OtherDoubleString extends BinaryRepresentation {
    constructor() {
        super("OD");
        this.maxLength = null;
        this.padByte = "00";
        this.noMultiple = true;
    }
}

class OtherFloatString extends BinaryRepresentation {
    constructor() {
        super("OF");
        this.maxLength = null;
        this.padByte = "00";
        this.noMultiple = true;
    }
}

export { paddingLeft };
export { tagFromNumbers };
export { ValueRepresentation };
