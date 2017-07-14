import { DicomMessage } from './DicomMessage.js';
import { ReadBufferStream } from './BufferStream.js';
import { WriteBufferStream } from './BufferStream.js';
import { Tag } from './Tag.js';

function paddingLeft(paddingValue, string) {
   return String(paddingValue + string).slice(-paddingValue.length);
}

function rtrim(str) {
  return str.replace(/\s*$/g, '');
}

function ltrim(str) {
  return str.replace(/^\s*/g, '');
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

var binaryVRs = ["FL", "FD", "SL", "SS", "UL", "US", "AT"],
    explicitVRs = ["OB", "OW", "OF", "SQ", "UC", "UR", "UT", "UN"],
    singleVRs = ["SQ", "OF", "OW", "OB", "UN"];

class ValueRepresentation {
    constructor(type, value) {
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
        if (!length)
          return this.defaultValue;
        if (this.maxLength != length)
          console.error("Invalid length for fixed length tag, vr " + this.type + ", length " + this.maxLength + " != " + length);
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
            if (length > 0)
                written += stream.writeString(value);
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
            var written = [], valueArgs = args.slice(2), func = stream["write"+type];
            if (Array.isArray(valueArgs[0])) {
                if (valueArgs[0].length < 1) {
                    written.push(0);
                } else {
                    var self = this;
                    valueArgs[0].forEach(function(v, k){
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

    writeBytes(stream, value, lengths) {
      var valid = true, valarr = Array.isArray(value) ? value : [value], total = 0;

      for (var i = 0;i < valarr.length;i++) {
          var checkValue = valarr[i], checklen = lengths[i], isString = false, displaylen = checklen;
          if (this.checkLength) {
            valid = this.checkLength(checkValue);
          } else if (this.maxCharLength) {
            var check = this.maxCharLength;//, checklen = checkValue.length;
            valid = checkValue.length <= check;
            displaylen = checkValue.length;
            isString = true;
          } else if (this.maxLength) {
            valid = checklen <= this.maxLength;
          }

          var errmsg = "Value exceeds max length, vr: " + this.type + ", value: " + checkValue + ", length: " + displaylen;
          if (!valid) {
            if(isString)
                console.log(errmsg);
            else
                throw new Error(errmsg);
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
        else if (type == "ox") vr = new UnknownValue();
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
        else throw "Invalid vr type " + type;

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

    writeBytes(stream, value) {
        var written = super.write(stream, "String", value);

        return super.writeBytes(stream, value, written);
    }
}

class BinaryRepresentation extends ValueRepresentation {
    constructor(type) {
        super(type);
    }

    writeBytes(stream, value, syntax, isEncapsulated) {
        var i;
        var binaryStream;
        if (isEncapsulated) {
            var fragmentSize = 1024 * 20,
                frames = value.length, startOffset = [];

            binaryStream = new WriteBufferStream(1024 * 1024 * 20, stream.isLittleEndian);
            for (i = 0;i < frames;i++) {
                startOffset.push(binaryStream.size);
                var frameBuffer = value[i], frameStream = new ReadBufferStream(frameBuffer),
                    fragmentsLength = Math.ceil(frameStream.size / fragmentSize);

                for (var j = 0, fragmentStart = 0;j < fragmentsLength;j++) {
                    var fragmentEnd = fragmentStart + fragmentSize;
                    if (j == fragmentsLength - 1) {
                        fragmentEnd = frameStream.size;
                    }
                    var fragStream = new ReadBufferStream(frameStream.getBuffer(fragmentStart, fragmentEnd));
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
            for (i = 0;i < startOffset.length;i++) {
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
            return super.writeBytes(stream, binaryData, [binaryStream.size]);
        }
    }

    readBytes(stream, length) {
        if (length == 0xffffffff) {
            var itemTagValue = Tag.readTag(stream), frames = [];
            if (itemTagValue.is(0xfffee000)) {
                var itemLength = stream.readUint32(), numOfFrames = 1, offsets = [];
                if (itemLength > 0x0) {
                    //has frames
                    numOfFrames = itemLength / 4;
                    var i = 0;
                    while (i++ < numOfFrames) {
                        offsets.push(stream.readUint32());
                    }
                } else {
                    offsets = [0];
                }
                var nextTag = Tag.readTag(stream), fragmentStream = null, start = 4,
                    frameOffset = offsets.shift();

                while (nextTag.is(0xfffee000)) {
                    if (frameOffset == start) {
                        frameOffset = offsets.shift();
                        if (fragmentStream !== null) {
                            frames.push(fragmentStream.buffer);
                            fragmentStream = null;
                        }
                    }
                    var frameItemLength = stream.readUint32(),
                        thisStream = stream.more(frameItemLength);

                    if (fragmentStream === null) {
                        fragmentStream = thisStream;
                    } else {
                        fragmentStream.concat(thisStream);
                    }

                    nextTag = Tag.readTag(stream);
                    start += 4 + frameItemLength;
                }
                if (fragmentStream !== null) {
                    frames.push(fragmentStream.buffer);
                }

                stream.readUint32();
            } else {
                throw new Error("Item tag not found after undefined binary length");
            }

            return frames;
        } else {
            var bytes;
            /*if (this.type == 'OW') {
                bytes = stream.readUint16Array(length);
            } else if (this.type == 'OB') {
                bytes = stream.readUint8Array(length);
            }*/
            bytes = stream.more(length).buffer;
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

    readBytes(stream, length) {
        var group = stream.readUint16(), element = stream.readUint16();
        return tagFromNumbers(group, element).value;
    }

    writeBytes(stream, value) {
        return super.writeBytes(stream, value, super.write(stream, "Uint32", value));
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
      //return this.readNullPaddedString(stream, length).trim();
      let ds = stream.readString(length);
      ds = ds.replace(/[^0-9.\\\-+e]/gi, "");
      return ds;
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

    readBytes(stream, length) {
        return stream.readFloat();
    }

    writeBytes(stream, value) {
        return super.writeBytes(stream, value, super.write(stream, "Float", value));
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

    readBytes(stream, length) {
        return stream.readDouble();
    }

    writeBytes(stream, value) {
        return super.writeBytes(stream, value, super.write(stream, "Double", value));
    }
}

class IntegerString extends StringRepresentation {
    constructor() {
        super("IS");
        this.maxLength = 12;
        this.padByte = "20";
    }

    readBytes(stream, length) {
        //return this.readNullPaddedString(stream, length);
        return stream.readString(length).trim();
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
        var cmps = value.split(/\^/);
        for (var i in cmps) {
            var cmp = cmps[i];
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

    readBytes(stream, length) {
        return stream.readInt32();
    }

    writeBytes(stream, value) {
        return super.writeBytes(stream, value, super.write(stream, 'Int32', value));
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
            var undefLength = sqlength == 0xffffffff, elements = [], read = 0;

            while (true) {
                var tag = readTag(stream), length = null;
                read += 4;

                if (tag.is(0xfffee0dd)) {
                    stream.readUint32();
                    break;
                } else if (!undefLength && (read == sqlength)) {
                    break;
                } else if (tag.is(0xfffee000)) {
                    length = stream.readUint32();
                    read += 4;
                    var itemStream = null, toRead = 0, undef = length == 0xffffffff;

                    if (undef) {
                        var stack = 0;
                        while (1) {
                            var g = stream.readUint16();
                            if (g == 0xfffe) {
                                var ge = stream.readUint16();
                                if (ge == 0xe00d) {
                                    stack--;
                                    if (stack < 0) {
                                        stream.increment(4);
                                        read += 8;
                                        break;
                                    } else {
                                        toRead += 4;
                                    }
                                } else if (ge == 0xe000) {
                                    stack++;
                                    toRead += 4;
                                } else {
                                    toRead += 2;
                                    stream.increment(-2);
                                }
                            } else {
                                toRead += 2;
                            }
                        }
                    } else {
                        toRead = length;
                    }

                    if (toRead) {
                        stream.increment(undef ? (-toRead-8) : 0);
                        itemStream = stream.more(toRead);//parseElements
                        read += toRead;
                        if (undef)
                            stream.increment(8);

                        var items = DicomMessage.read(itemStream, syntax);
                        elements.push(items);
                    }
                    if (!undefLength && (read == sqlength)) {
                        break;
                    }
                }
            }
            return elements;
        }
    }

    writeBytes(stream, value, syntax) {
        var fields = [], startOffset = stream.offset, written = 0;
        if (value) {
            for (var i = 0;i < value.length;i++) {
                var item = value[i];
                super.write(stream, "Uint16", 0xfffe);
                super.write(stream, "Uint16", 0xe000);
                super.write(stream, "Uint32", 0xffffffff);

                written += DicomMessage.write(item, stream, syntax);

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

        var totalLength = stream.offset - startOffset;
        return super.writeBytes(stream, value, [written]);
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

    readBytes(stream, length) {
        return stream.readInt16();
    }

    writeBytes(stream, value) {
        return super.writeBytes(stream, value, super.write(stream, "Int16", value));
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

    readBytes(stream, length) {
        return stream.readUint16();
    }

    writeBytes(stream, value) {
        return super.writeBytes(stream, value, super.write(stream, "Uint16", value));
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

    readBytes(stream, length) {
        return stream.readUint32();
    }

    writeBytes(stream, value) {
        return super.writeBytes(stream, value, super.write(stream, "Uint32", value));
    }
}

class UniqueIdentifier extends StringRepresentation {
    constructor() {
        super("UI");
        this.maxLength = 64;
        this.padByte = "00";
    }

    readBytes(stream, length) {
        return this.readNullPaddedString(stream, length).replace(/[^0-9.]/g,'');
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

class UnknownValue extends StringRepresentation {
    constructor() {
        super("UN");
        this.maxLength = null;
        this.padByte = "00";
        this.noMultiple = true;
    }

    readBytes(stream, length) {
        return stream.readString(length);
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

    /*writeBytes(stream, value) {
        var written = super.write(stream, 'Hex', value);
        return super.writeBytes(stream, value, written);
    } */
}

export { paddingLeft };
export { tagFromNumbers };
export { ValueRepresentation };
