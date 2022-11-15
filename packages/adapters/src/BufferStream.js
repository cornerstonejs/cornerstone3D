import pako from "pako";

function toInt(val) {
    if (isNaN(val)) {
        throw new Error("Not a number: " + val);
    } else if (typeof val == "string") {
        return parseInt(val);
    } else return val;
}

function toFloat(val) {
    if (typeof val == "string") {
        return parseFloat(val);
    } else return val;
}

class BufferStream {
    constructor(sizeOrBuffer, littleEndian) {
        this.buffer =
            typeof sizeOrBuffer == "number"
                ? new ArrayBuffer(sizeOrBuffer)
                : sizeOrBuffer;
        if (!this.buffer) {
            this.buffer = new ArrayBuffer(0);
        }
        this.view = new DataView(this.buffer);
        this.offset = 0;
        this.isLittleEndian = littleEndian || false;
        this.size = 0;
        this.encoder = new TextEncoder("utf-8");
    }

    setEndian(isLittle) {
        this.isLittleEndian = isLittle;
    }

    writeUint8(value) {
        this.checkSize(1);
        this.view.setUint8(this.offset, toInt(value));
        return this.increment(1);
    }

    writeUint8Repeat(value, count) {
        const v = toInt(value);
        this.checkSize(count);
        for (let i = 0; i < count; i++) {
            this.view.setUint8(this.offset + i, v);
        }
        return this.increment(count);
    }

    writeInt8(value) {
        this.checkSize(1);
        this.view.setInt8(this.offset, toInt(value));
        return this.increment(1);
    }

    writeUint16(value) {
        this.checkSize(2);
        this.view.setUint16(this.offset, toInt(value), this.isLittleEndian);
        return this.increment(2);
    }

    writeTwoUint16s(value) {
        this.checkSize(4);
        const first = value >> 16;
        const second = value & 0xffff;
        this.view.setUint16(this.offset, toInt(first), this.isLittleEndian);
        this.view.setUint16(
            this.offset + 2,
            toInt(second),
            this.isLittleEndian
        );
        return this.increment(4);
    }

    writeInt16(value) {
        this.checkSize(2);
        this.view.setInt16(this.offset, toInt(value), this.isLittleEndian);
        return this.increment(2);
    }

    writeUint32(value) {
        this.checkSize(4);
        this.view.setUint32(this.offset, toInt(value), this.isLittleEndian);
        return this.increment(4);
    }

    writeInt32(value) {
        this.checkSize(4);
        this.view.setInt32(this.offset, toInt(value), this.isLittleEndian);
        return this.increment(4);
    }

    writeFloat(value) {
        this.checkSize(4);
        this.view.setFloat32(this.offset, toFloat(value), this.isLittleEndian);
        return this.increment(4);
    }

    writeDouble(value) {
        this.checkSize(8);
        this.view.setFloat64(this.offset, toFloat(value), this.isLittleEndian);
        return this.increment(8);
    }

    writeUTF8String(value) {
        const encodedString = this.encoder.encode(value);
        this.checkSize(encodedString.byteLength);
        new Uint8Array(this.buffer).set(encodedString, this.offset);
        return this.increment(encodedString.byteLength);
    }

    writeAsciiString(value) {
        value = value || "";
        var len = value.length;
        this.checkSize(len);
        var startOffset = this.offset;
        for (let i = 0; i < len; i++) {
            var charcode = value.charCodeAt(i);
            this.view.setUint8(startOffset + i, charcode);
        }
        return this.increment(len);
    }

    readUint32() {
        var val = this.view.getUint32(this.offset, this.isLittleEndian);
        this.increment(4);
        return val;
    }

    readUint16() {
        var val = this.view.getUint16(this.offset, this.isLittleEndian);
        this.increment(2);
        return val;
    }

    readUint8() {
        var val = this.view.getUint8(this.offset);
        this.increment(1);
        return val;
    }

    peekUint8(offset) {
        return this.view.getUint8(this.offset + offset);
    }

    readUint8Array(length) {
        var arr = new Uint8Array(this.buffer, this.offset, length);
        this.increment(length);
        return arr;
    }

    readUint16Array(length) {
        var sixlen = length / 2,
            arr = new Uint16Array(sixlen),
            i = 0;
        while (i++ < sixlen) {
            arr[i] = this.view.getUint16(this.offset, this.isLittleEndian);
            this.offset += 2;
        }
        return arr;
    }

    readInt16() {
        var val = this.view.getInt16(this.offset, this.isLittleEndian);
        this.increment(2);
        return val;
    }

    readInt32() {
        var val = this.view.getInt32(this.offset, this.isLittleEndian);
        this.increment(4);
        return val;
    }

    readFloat() {
        var val = this.view.getFloat32(this.offset, this.isLittleEndian);
        this.increment(4);
        return val;
    }

    readDouble() {
        var val = this.view.getFloat64(this.offset, this.isLittleEndian);
        this.increment(8);
        return val;
    }

    readAsciiString(length) {
        var result = "";
        var start = this.offset;
        var end = this.offset + length;
        if (end >= this.buffer.byteLength) {
            end = this.buffer.byteLength;
        }
        for (let i = start; i < end; ++i) {
            result += String.fromCharCode(this.view.getUint8(i));
        }
        this.increment(end - start);
        return result;
    }

    readVR() {
        var vr =
            String.fromCharCode(this.view.getUint8(this.offset)) +
            String.fromCharCode(this.view.getUint8(this.offset + 1));
        this.increment(2);
        return vr;
    }

    readEncodedString(length) {
        if (this.offset + length >= this.buffer.byteLength) {
            length = this.buffer.byteLength - this.offset;
        }
        const view = new DataView(this.buffer, this.offset, length);
        const result = this.decoder.decode(view);
        this.increment(length);
        return result;
    }

    readHex(length) {
        var hexString = "";
        for (var i = 0; i < length; i++) {
            hexString += this.readUint8().toString(16);
        }
        return hexString;
    }

    checkSize(step) {
        if (this.offset + step > this.buffer.byteLength) {
            //throw new Error("Writing exceeded the size of buffer");
            //
            // Resize the buffer.
            // The idea is that when it is necessary to increase the buffer size,
            // there will likely be more bytes which need to be written to the
            // buffer in the future. Buffer allocation is costly.
            // So we increase the buffer size right now
            // by a larger amount than necessary, to reserve space for later
            // writes which then can be done much faster. The current size of
            // the buffer is the best estimate of the scale by which the size
            // should increase.
            // So approximately doubling the size of the buffer
            // (while ensuring it fits the new data) is a simple but effective strategy.
            var dstSize = this.offset + step + this.buffer.byteLength;
            var dst = new ArrayBuffer(dstSize);
            new Uint8Array(dst).set(new Uint8Array(this.buffer));
            this.buffer = dst;
            this.view = new DataView(this.buffer);
        }
    }

    concat(stream) {
        var available = this.buffer.byteLength - this.offset;
        if (stream.size > available) {
            let newbuf = new ArrayBuffer(this.offset + stream.size);
            let int8 = new Uint8Array(newbuf);
            int8.set(new Uint8Array(this.getBuffer(0, this.offset)));
            int8.set(
                new Uint8Array(stream.getBuffer(0, stream.size)),
                this.offset
            );
            this.buffer = newbuf;
            this.view = new DataView(this.buffer);
        } else {
            let int8 = new Uint8Array(this.buffer);
            int8.set(
                new Uint8Array(stream.getBuffer(0, stream.size)),
                this.offset
            );
        }
        this.offset += stream.size;
        this.size = this.offset;
        return this.buffer.byteLength;
    }

    increment(step) {
        this.offset += step;
        if (this.offset > this.size) {
            this.size = this.offset;
        }
        return step;
    }

    getBuffer(start, end) {
        if (!start && !end) {
            start = 0;
            end = this.size;
        }

        return this.buffer.slice(start, end);
    }

    more(length) {
        if (this.offset + length > this.endOffset) {
            throw new Error("Request more than currently allocated buffer");
        }

        const newBuf = new ReadBufferStream(this.buffer, null, {
            start: this.offset,
            stop: this.offset + length
        });
        this.increment(length);

        return newBuf;
    }

    reset() {
        this.offset = 0;
        return this;
    }

    end() {
        return this.offset >= this.buffer.byteLength;
    }

    toEnd() {
        this.offset = this.buffer.byteLength;
    }
}

class ReadBufferStream extends BufferStream {
    constructor(
        buffer,
        littleEndian,
        options = {
            start: null,
            stop: null,
            noCopy: false
        }
    ) {
        super(buffer, littleEndian);
        this.offset = options.start || 0;
        this.size = options.stop || this.buffer.byteLength;
        this.noCopy = options.noCopy;
        this.startOffset = this.offset;
        this.endOffset = this.size;
        this.decoder = new TextDecoder("latin1");
    }

    setDecoder(decoder) {
        this.decoder = decoder;
    }

    getBuffer(start, end) {
        if (this.noCopy) {
            return new Uint8Array(this.buffer, start, end - start);
        }
        if (!start && !end) {
            start = 0;
            end = this.size;
        }

        return this.buffer.slice(start, end);
    }

    reset() {
        this.offset = this.startOffset;
        return this;
    }

    end() {
        return this.offset >= this.endOffset;
    }

    toEnd() {
        this.offset = this.endOffset;
    }

    writeUint8(value) {
        throw new Error(value, "writeUint8 not implemented");
    }

    writeUint8Repeat(value, count) {
        throw new Error(value, "writeUint8Repeat not implemented");
    }

    writeInt8(value) {
        throw new Error(value, "writeInt8 not implemented");
    }

    writeUint16(value) {
        throw new Error(value, "writeUint16 not implemented");
    }

    writeTwoUint16s(value) {
        throw new Error(value, "writeTwoUint16s not implemented");
    }

    writeInt16(value) {
        throw new Error(value, "writeInt16 not implemented");
    }

    writeUint32(value) {
        throw new Error(value, "writeUint32 not implemented");
    }

    writeInt32(value) {
        throw new Error(value, "writeInt32 not implemented");
    }

    writeFloat(value) {
        throw new Error(value, "writeFloat not implemented");
    }

    writeDouble(value) {
        throw new Error(value, "writeDouble not implemented");
    }

    writeAsciiString(value) {
        throw new Error(value, "writeAsciiString not implemented");
    }

    writeUTF8String(value) {
        throw new Error(value, "writeUTF8String not implemented");
    }

    checkSize(step) {
        throw new Error(step, "checkSize not implemented");
    }

    concat(stream) {
        throw new Error(stream, "concat not implemented");
    }
}

class DeflatedReadBufferStream extends ReadBufferStream {
    constructor(stream, options) {
        const inflatedBuffer = pako.inflateRaw(
            stream.getBuffer(stream.offset, stream.size)
        );
        super(inflatedBuffer.buffer, stream.littleEndian, options);
    }
}

class WriteBufferStream extends BufferStream {
    constructor(buffer, littleEndian) {
        super(buffer, littleEndian);
        this.size = 0;
    }
}

export { ReadBufferStream };
export { DeflatedReadBufferStream };
export { WriteBufferStream };
