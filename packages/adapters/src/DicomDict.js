import { WriteBufferStream } from "./BufferStream";
import { DicomMessage } from "./DicomMessage";

const EXPLICIT_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";

class DicomDict {
    constructor(meta) {
        this.meta = meta;
        this.dict = {};
    }

    upsertTag(tag, vr, values) {
        if (this.dict[tag]) {
            this.dict[tag].Value = values;
        } else {
            this.dict[tag] = { vr: vr, Value: values };
        }
    }

    write(writeOptions = { allowInvalidVRLength: false }) {
        var metaSyntax = EXPLICIT_LITTLE_ENDIAN;
        var fileStream = new WriteBufferStream(4096, true);
        fileStream.writeUint8Repeat(0, 128);
        fileStream.writeAsciiString("DICM");

        var metaStream = new WriteBufferStream(1024);
        if (!this.meta["00020010"]) {
            this.meta["00020010"] = {
                vr: "UI",
                Value: [EXPLICIT_LITTLE_ENDIAN]
            };
        }
        DicomMessage.write(this.meta, metaStream, metaSyntax, writeOptions);
        DicomMessage.writeTagObject(
            fileStream,
            "00020000",
            "UL",
            metaStream.size,
            metaSyntax,
            writeOptions
        );
        fileStream.concat(metaStream);

        var useSyntax = this.meta["00020010"].Value[0];
        DicomMessage.write(this.dict, fileStream, useSyntax, writeOptions);
        return fileStream.getBuffer();
    }
}

export { DicomDict };
