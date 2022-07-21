import log from "./log.js";
import { DicomMessage } from "./DicomMessage.js";
import { ReadBufferStream } from "./BufferStream.js";
import { WriteBufferStream } from "./BufferStream.js";
import { Tag } from "./Tag.js";

function rtrim(str) {
    return str.replace(/\s*$/g, "");
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
        this._isBinary = binaryVRs.indexOf(this.type) != -1;
        this._allowMultiple =
            !this._isBinary && singleVRs.indexOf(this.type) == -1;
        this._isExplicit = explicitVRs.indexOf(this.type) != -1;
    }

    isBinary() {
        return this._isBinary;
    }

    allowMultiple() {
        return this._allowMultiple;
    }

    isExplicit() {
        return this._isExplicit;
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
        return stream.readAsciiString(length);
    }

    readNullPaddedString(stream, length) {
        if (!length) return "";
        if (stream.peekUint8(length - 1) !== 0) {
            return stream.readAsciiString(length);
        } else {
            var val = stream.readAsciiString(length - 1);
            stream.increment(1);
            return val;
        }
    }

    write(stream, type) {
        var args = Array.from(arguments);
        if (args[2] === null || args[2] === "" || args[2] === undefined) {
            return [stream.writeAsciiString("")];
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
                            stream.writeUint8(0x5c);
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
            stream.writeUint8(this.padByte);
            written++;
        }
        return written;
    }

    static createByTypeString(type) {
        var vr = VRinstances[type];
        if (vr === undefined) {
            if (type == "ox") {
                // TODO: determine VR based on context (could be 1 byte pixel data)
                // https://github.com/dgobbi/vtk-dicom/issues/38
                log.error("Invalid vr type " + type + " - using OW");
                vr = VRinstances["OW"];
            } else if (type == "xs") {
                log.error("Invalid vr type " + type + " - using US");
                vr = VRinstances["US"];
            } else {
                log.error("Invalid vr type " + type + " - using UN");
                vr = VRinstances["UN"];
            }
        }
        return vr;
    }
}

class AsciiStringRepresentation extends ValueRepresentation {
    constructor(type) {
        super(type);
    }

    readBytes(stream, length) {
        return stream.readAsciiString(length);
    }

    writeBytes(stream, value, writeOptions) {
        const written = super.write(stream, "AsciiString", value);

        return super.writeBytes(stream, value, written, writeOptions);
    }
}

class EncodedStringRepresentation extends ValueRepresentation {
    constructor(type) {
        super(type);
    }

    readBytes(stream, length) {
        return stream.readEncodedString(length);
    }

    writeBytes(stream, value, writeOptions) {
        const written = super.write(stream, "UTF8String", value);

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
                const needsPadding = Boolean(value[i].byteLength & 1);
                bufferLength += value[i].byteLength + (needsPadding ? 1 : 0);
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
                const needsPadding = Boolean(value[i].byteLength & 1);

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
                    const isFinalFragment = j === fragmentsLength - 1;

                    var fragmentEnd = fragmentStart + frameStream.size;
                    if (fragmentMultiframe) {
                        fragmentEnd = fragmentStart + fragmentSize;
                    }
                    if (isFinalFragment) {
                        fragmentEnd = frameStream.size;
                    }
                    var fragStream = new ReadBufferStream(
                        frameStream.getBuffer(fragmentStart, fragmentEnd)
                    );
                    fragmentStart = fragmentEnd;
                    binaryStream.writeUint16(0xfffe);
                    binaryStream.writeUint16(0xe000);

                    const addPaddingByte = isFinalFragment && needsPadding;

                    binaryStream.writeUint32(
                        fragStream.size + (addPaddingByte ? 1 : 0)
                    );
                    binaryStream.concat(fragStream);

                    if (addPaddingByte) {
                        binaryStream.writeInt8(this.padByte);
                    }
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

                const SequenceItemTag = 0xfffee000;
                const SequenceDelimiterTag = 0xfffee0dd;

                const getNextSequenceItemData = stream => {
                    const nextTag = Tag.readTag(stream);
                    if (nextTag.is(SequenceItemTag)) {
                        const itemLength = stream.readUint32();
                        const buffer = stream.getBuffer(
                            stream.offset,
                            stream.offset + itemLength
                        );
                        stream.increment(itemLength);
                        return buffer;
                    } else if (nextTag.is(SequenceDelimiterTag)) {
                        // Read SequenceDelimiterItem value for the SequenceDelimiterTag
                        if (stream.readUint32() !== 0) {
                            throw Error(
                                "SequenceDelimiterItem tag value was not zero"
                            );
                        }
                        return null;
                    }

                    throw Error("Invalid tag in sequence");
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
                        const rangeStream = new ReadBufferStream(
                            stream.buffer,
                            stream.isLittleEndian,
                            {
                                start: start,
                                stop: stop,
                                noCopy: stream.noCopy
                            }
                        );

                        let frameSize = 0;
                        while (!rangeStream.end()) {
                            const buf = getNextSequenceItemData(rangeStream);
                            if (buf === null) {
                                break;
                            }
                            fragments.push(buf);
                            frameSize += buf.byteLength;
                        }

                        // Ensure the parent stream's offset is kept up to date
                        stream.offset = rangeStream.offset;

                        // If there's only one buffer thne just return it directly
                        if (fragments.length === 1) {
                            return fragments[0];
                        }

                        if (rangeStream.noCopy) {
                            // return the fragments for downstream application to process
                            return fragments;
                        } else {
                            // Allocate a final ArrayBuffer and concat all buffers into it
                            const mergedFrame = new ArrayBuffer(frameSize);
                            const u8Data = new Uint8Array(mergedFrame);
                            fragments.reduce((offset, buffer) => {
                                u8Data.set(new Uint8Array(buffer), offset);
                                return offset + buffer.byteLength;
                            }, 0);

                            return mergedFrame;
                        }
                    });
                }
                // If no offset table, loop through remainder of stream looking for termination tag
                else {
                    while (!stream.end()) {
                        const buffer = getNextSequenceItemData(stream);
                        if (buffer === null) {
                            break;
                        }
                        frames.push(buffer);
                    }
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

class ApplicationEntity extends AsciiStringRepresentation {
    constructor() {
        super("AE");
        this.maxLength = 16;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        return stream.readAsciiString(length).trim();
    }
}

class CodeString extends AsciiStringRepresentation {
    constructor() {
        super("CS");
        this.maxLength = 16;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        return stream.readAsciiString(length).trim();
    }
}

class AgeString extends AsciiStringRepresentation {
    constructor() {
        super("AS");
        this.maxLength = 4;
        this.padByte = 0x20;
        this.fixed = true;
        this.defaultValue = "";
    }
}

class AttributeTag extends ValueRepresentation {
    constructor() {
        super("AT");
        this.maxLength = 4;
        this.valueLength = 4;
        this.padByte = 0;
        this.fixed = true;
    }

    readBytes(stream) {
        return Tag.readTag(stream).value;
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

class DateValue extends AsciiStringRepresentation {
    constructor(value) {
        super("DA", value);
        this.maxLength = 18;
        this.padByte = 0x20;
        //this.fixed = true;
        this.defaultValue = "";
    }
}

class DecimalString extends AsciiStringRepresentation {
    constructor() {
        super("DS");
        this.maxLength = 16;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        const BACKSLASH = String.fromCharCode(0x5c);
        let ds = stream.readAsciiString(length);
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

class DateTime extends AsciiStringRepresentation {
    constructor() {
        super("DT");
        this.maxLength = 26;
        this.padByte = 0x20;
    }
}

class FloatingPointSingle extends ValueRepresentation {
    constructor() {
        super("FL");
        this.maxLength = 4;
        this.padByte = 0;
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
        this.padByte = 0;
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

class IntegerString extends AsciiStringRepresentation {
    constructor() {
        super("IS");
        this.maxLength = 12;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        const BACKSLASH = String.fromCharCode(0x5c);
        let is = stream.readAsciiString(length).trim();

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

class LongString extends EncodedStringRepresentation {
    constructor() {
        super("LO");
        this.maxCharLength = 64;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        return stream.readEncodedString(length).trim();
    }
}

class LongText extends EncodedStringRepresentation {
    constructor() {
        super("LT");
        this.maxCharLength = 10240;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        return rtrim(stream.readEncodedString(length));
    }
}

class PersonName extends EncodedStringRepresentation {
    constructor() {
        super("PN");
        this.maxLength = null;
        this.padByte = 0x20;
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
        return rtrim(stream.readEncodedString(length));
    }
}

class ShortString extends EncodedStringRepresentation {
    constructor() {
        super("SH");
        this.maxCharLength = 16;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        return stream.readEncodedString(length).trim();
    }
}

class SignedLong extends ValueRepresentation {
    constructor() {
        super("SL");
        this.maxLength = 4;
        this.padByte = 0;
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
        this.padByte = 0;
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
                var tag = Tag.readTag(stream),
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

                        var items = DicomMessage._read(itemStream, syntax);
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
        this.padByte = 0;
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

class ShortText extends EncodedStringRepresentation {
    constructor() {
        super("ST");
        this.maxCharLength = 1024;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        return rtrim(stream.readEncodedString(length));
    }
}

class TimeValue extends AsciiStringRepresentation {
    constructor() {
        super("TM");
        this.maxLength = 14;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        return rtrim(stream.readAsciiString(length));
    }
}

class UnlimitedCharacters extends EncodedStringRepresentation {
    constructor() {
        super("UC");
        this.maxLength = null;
        this.multi = true;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        return rtrim(stream.readEncodedString(length));
    }
}

class UnlimitedText extends EncodedStringRepresentation {
    constructor() {
        super("UT");
        this.maxLength = null;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        return rtrim(stream.readEncodedString(length));
    }
}

class UnsignedShort extends ValueRepresentation {
    constructor() {
        super("US");
        this.maxLength = 2;
        this.padByte = 0;
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
        this.padByte = 0;
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

class UniqueIdentifier extends AsciiStringRepresentation {
    constructor() {
        super("UI");
        this.maxLength = 64;
        this.padByte = 0;
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

class UniversalResource extends AsciiStringRepresentation {
    constructor() {
        super("UR");
        this.maxLength = null;
        this.padByte = 0x20;
    }

    readBytes(stream, length) {
        return stream.readAsciiString(length);
    }
}

class UnknownValue extends BinaryRepresentation {
    constructor() {
        super("UN");
        this.maxLength = null;
        this.padByte = 0;
        this.noMultiple = true;
    }
}

class OtherWordString extends BinaryRepresentation {
    constructor() {
        super("OW");
        this.maxLength = null;
        this.padByte = 0;
        this.noMultiple = true;
    }
}

class OtherByteString extends BinaryRepresentation {
    constructor() {
        super("OB");
        this.maxLength = null;
        this.padByte = 0;
        this.noMultiple = true;
    }
}

class OtherDoubleString extends BinaryRepresentation {
    constructor() {
        super("OD");
        this.maxLength = null;
        this.padByte = 0;
        this.noMultiple = true;
    }
}

class OtherFloatString extends BinaryRepresentation {
    constructor() {
        super("OF");
        this.maxLength = null;
        this.padByte = 0;
        this.noMultiple = true;
    }
}

// these VR instances are precreate and are reused for each requested vr/tag
let VRinstances = {
    AE: new ApplicationEntity(),
    AS: new AgeString(),
    AT: new AttributeTag(),
    CS: new CodeString(),
    DA: new DateValue(),
    DS: new DecimalString(),
    DT: new DateTime(),
    FL: new FloatingPointSingle(),
    FD: new FloatingPointDouble(),
    IS: new IntegerString(),
    LO: new LongString(),
    LT: new LongText(),
    OB: new OtherByteString(),
    OD: new OtherDoubleString(),
    OF: new OtherFloatString(),
    OW: new OtherWordString(),
    PN: new PersonName(),
    SH: new ShortString(),
    SL: new SignedLong(),
    SQ: new SequenceOfItems(),
    SS: new SignedShort(),
    ST: new ShortText(),
    TM: new TimeValue(),
    UC: new UnlimitedCharacters(),
    UI: new UniqueIdentifier(),
    UL: new UnsignedLong(),
    UN: new UnknownValue(),
    UR: new UniversalResource(),
    US: new UnsignedShort(),
    UT: new UnlimitedText()
};

export { ValueRepresentation };
