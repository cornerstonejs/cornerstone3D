#!/usr/bin/env python3
"""Transcode a testImages base image into the transfer syntaxes cs3d now decodes.

decoders_test.ts compares every variant against the decoded base image, so each
fixture has to be a lossless re-encoding of that exact image and nothing else.
Every file written here is read back, decoded, and compared with the source
pixels; a file that does not round-trip is not left behind.

    python make-fixtures.py <testImages dir> [base.dcm ...]

Defaults to both base images: CTImage.dcm (512x512 16 bit signed grayscale) and
ColorImage.dcm (768x512 8 bit interleaved RGB). The colour one matters because
three samples per pixel exercises the frame length arithmetic, and because JPEG
XL colour is a different code path in the codec from JPEG XL grayscale.

ColorImage.dcm is kodim23 from the Kodak True Color suite, released for
unrestricted use, wrapped in a synthetic Secondary Capture header - not medical
data, no human subject. Each file carries that attribution in (0008,2111)
DerivationDescription. Taken from viewer-testdata dcm/colorEncode.
"""

from __future__ import annotations

import sys
import zlib
from pathlib import Path

import numpy as np
import pydicom
from pydicom.encaps import encapsulate, generate_frames
from pydicom.uid import UID
from pydicom._uid_dict import UID_dictionary

# pydicom 3.0's UID dictionary predates these supplements, so it rejects them as
# "not a valid transfer syntax" when writing. Every is_* property on UID derives
# from this table, so registering the PS3.6 rows makes them first-class. This is
# the same registration viewer-testdata's encode-samples.py does.
for _uid, _name, _keyword in (
    ("1.2.840.10008.1.2.4.110", "JPEG XL Lossless", "JPEGXLLossless"),
    ("1.2.840.10008.1.2.4.111", "JPEG XL JPEG Recompression", "JPEGXLJPEGRecompression"),
    ("1.2.840.10008.1.2.4.112", "JPEG XL", "JPEGXL"),
    ("1.2.840.10008.1.2.8.1", "Deflated Image Frame Compression", "DeflatedImageFrameCompression"),
):
    UID_dictionary.setdefault(_uid, (_name, "Transfer Syntax", "", "", _keyword))

# name -> (uid, suffix used by decoders_test.ts)
TARGETS = {
    "1.2.840.10008.1.2.1.98": "EncapsulatedUncompressedExplicitVRLittleEndianTransferSyntax",
    "1.2.840.10008.1.2.8.1": "DeflatedImageFrameCompressionTransferSyntax",
    "1.2.840.10008.1.2.4.110": "JPEGXLLosslessTransferSyntax",
}


def even(data: bytes) -> bytes:
    """DICOM items must be an even number of bytes."""
    return data if len(data) % 2 == 0 else data + b"\x00"


def encode_encapsulated_uncompressed(frame: bytes) -> bytes:
    # PS3.5 A.4.11: the fragment holds the frame's native little endian pixel
    # data, padded to an even length. Nothing is compressed.
    return even(frame)


def encode_deflated_frame(frame: bytes) -> bytes:
    # PS3.5 A.4.13: raw DEFLATE per RFC 1951 - no zlib header or Adler-32
    # trailer, hence wbits=-15 - with a trailing NULL if the result is odd.
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)
    return even(compressor.compress(frame) + compressor.flush())


def encode_jpegxl(pixels: np.ndarray) -> bytes:
    import imagecodecs

    # JPEG XL has no signed sample type, so the two's complement bit pattern is
    # encoded as unsigned and the reader reinterprets it per
    # PixelRepresentation. This is the convention the released corpus uses.
    unsigned = np.ascontiguousarray(pixels).view(
        np.uint16 if pixels.dtype.itemsize == 2 else np.uint8
    )
    # Colour arrives as (rows, columns, samples) and is encoded as such, so the
    # codec writes a three channel image rather than a wider grayscale one.
    return even(imagecodecs.jpegxl_encode(unsigned, lossless=True))


def build(source: pydicom.Dataset, uid: str, out: Path) -> None:
    frame = source.PixelData
    pixels = source.pixel_array

    if uid == "1.2.840.10008.1.2.1.98":
        fragment = encode_encapsulated_uncompressed(frame)
    elif uid == "1.2.840.10008.1.2.8.1":
        fragment = encode_deflated_frame(frame)
    elif uid == "1.2.840.10008.1.2.4.110":
        fragment = encode_jpegxl(pixels)
    else:
        raise SystemExit(f"no encoder for {uid}")

    ds = pydicom.dcmread(source.filename)
    ds.file_meta.TransferSyntaxUID = UID(uid)
    ds.PixelData = encapsulate([fragment])
    ds["PixelData"].is_undefined_length = True
    ds.save_as(out, implicit_vr=False, little_endian=True, enforce_file_format=True)

    verify(out, uid, pixels)


def verify(path: Path, uid: str, expected: np.ndarray) -> None:
    ds = pydicom.dcmread(path)
    if str(ds.file_meta.TransferSyntaxUID) != uid:
        raise SystemExit(f"{path.name}: wrote {ds.file_meta.TransferSyntaxUID}, not {uid}")

    frame = next(generate_frames(ds.PixelData, number_of_frames=1))
    dtype = expected.dtype

    if uid == "1.2.840.10008.1.2.1.98":
        raw = frame[: expected.nbytes]
    elif uid == "1.2.840.10008.1.2.8.1":
        raw = zlib.decompress(frame, -15)[: expected.nbytes]
    else:
        import imagecodecs

        decoded = np.squeeze(imagecodecs.jpegxl_decode(frame))
        raw = np.ascontiguousarray(decoded).tobytes()[: expected.nbytes]

    got = np.frombuffer(raw, dtype=dtype).reshape(expected.shape)
    if not np.array_equal(got, expected):
        raise SystemExit(f"{path.name}: pixels do not round-trip")

    print(f"  {path.name}  {len(frame)} frame bytes, round-trips")


def main() -> None:
    test_images = Path(sys.argv[1])
    bases = sys.argv[2:] or ["CTImage.dcm", "ColorImage.dcm"]

    for base in bases:
        source = pydicom.dcmread(test_images / base)
        print(
            f"source {base}: {source.Rows}x{source.Columns} "
            f"{source.BitsAllocated}bit spp={source.SamplesPerPixel} "
            f"pi={source.PhotometricInterpretation} "
            f"pr={source.PixelRepresentation}"
        )

        for uid, name in TARGETS.items():
            build(source, uid, test_images / f"{base}_{name}_{uid}.dcm")


if __name__ == "__main__":
    main()
