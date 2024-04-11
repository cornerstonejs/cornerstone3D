const html = `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.3.1/dist/css/bootstrap.min.css" integrity="sha384-ggOyR0iXCbMQv3Xipma34MD+dH/1fQ784/j6cY/iJTQUOhcWr7x9JvoRxT2MZw1T" crossorigin="anonymous">

<div class="container mt-4">
   <select id="imageSelector">
    <option value="" selected>Select an image</option>
    <optgroup label="CharLS">
        <option>CTImage.dcm_JPEGLSLosslessTransferSyntax_1.2.840.10008.1.2.4.80.dcm</option>
        <option>CTImage.dcm_JPEGLSLossyTransferSyntax_1.2.840.10008.1.2.4.81.dcm</option>
    </optgroup>
    <optgroup label="libjpeg-turbo 8-bit">
        <option>CTImage.dcm_JPEGProcess1TransferSyntax_1.2.840.10008.1.2.4.50.dcm</option>
    </optgroup>
    <optgroup label="RLE">
        <option>CTImage.dcm_RLELosslessTransferSyntax_1.2.840.10008.1.2.5.dcm</option>
    </optgroup>
    <optgroup label="JPEG Lossless">
        <option>CTImage.dcm_JPEGProcess14TransferSyntax_1.2.840.10008.1.2.4.57.dcm</option>
        <option>CTImage.dcm_JPEGProcess14SV1TransferSyntax_1.2.840.10008.1.2.4.70.dcm</option>
    </optgroup>
    <optgroup label="JPEG 2000">
        <option>CT1_J2KR</option>
        <option>CT2_J2KR</option>
        <option>CTImage.dcm_JPEG2000LosslessOnlyTransferSyntax_1.2.840.10008.1.2.4.90.dcm</option>
        <option>CTImage.dcm_JPEG2000TransferSyntax_1.2.840.10008.1.2.4.91.dcm</option>
    </optgroup>
    <optgroup label="Deflate">
        <option>CTImage.dcm_DeflatedExplicitVRLittleEndianTransferSyntax_1.2.840.10008.1.2.1.99.dcm</option>
    </optgroup>
    <optgroup label="Color Images">
        <option>TestPattern_JPEG-Baseline_YBR422.dcm</option>
        <option>TestPattern_JPEG-Baseline_YBRFull.dcm</option>
        <option>TestPattern_JPEG-Lossless_RGB.dcm</option>
        <option>TestPattern_JPEG-LS-Lossless.dcm</option>
        <option>TestPattern_JPEG-LS-NearLossless.dcm</option>
        <option>TestPattern_Palette_16.dcm</option>
        <option>TestPattern_Palette.dcm</option>
        <option>TestPattern_RGB.dcm</option>
    </optgroup>
    <optgroup label="TG-18 Luminance-1k">
        <option>TG_18-luminance-1K/TG18-AD/TG18-AD-1k-01.dcm</option>
        <option>TG_18-luminance-1K/TG18-CT/TG18-CT-1k-01.dcm</option>
        <option>TG_18-luminance-1K/TG18-LN/TG18-LN-1k-01.dcm</option>
        <option>TG_18-luminance-1K/TG18-LN/TG18-LN-1k-04.dcm</option>
        <option>TG_18-luminance-1K/TG18-LN/TG18-LN-1k-09.dcm</option>
        <option>TG_18-luminance-1K/TG18-LN/TG18-LN-1k-13.dcm</option>
        <option>TG_18-luminance-1K/TG18-LN/TG18-LN-1k-18.dcm</option>
        <option>TG_18-luminance-1K/TG18-MP/TG18-MP-1k-01.dcm</option>
        <option>TG_18-luminance-1K/TG18-UN/TG18-UN-1k-01.dcm</option>
        <option>TG_18-luminance-1K/TG18-UNL/TG18-UNL-1k-01.dcm</option>
    </optgroup>
    <optgroup label="TG-18 Multi-1k">
        <option>TG_18-multi-1K/TG18-BR/TG18-BR-1k-01.dcm</option>
        <option>TG_18-multi-1K/TG18-QC/TG18-QC-1k-01.dcm</option>
        <option>TG_18-multi-1K/TG18-pQC/TG18-PQC-1k-01.dcm</option>
    </optgroup>
    <optgroup label="TG-18 Noise-1k">
        <option>TG_18-noise-1k/TG18-AFC/TG18-AFC-1k-01.dcm</option>
        <option>TG_18-noise-1k/TG18-NS/TG18-NS-1k-01.dcm</option>
        <option>TG_18-noise-1k/TG18-NS/TG18-NS-1k-02.dcm</option>
        <option>TG_18-noise-1k/TG18-NS/TG18-NS-1k-03.dcm</option>
    </optgroup>
    <optgroup label="TG-18 Resolution-2k">
        <option>TG_18-resolution-2k/TG18-CX/TG18-CX-2k-01.dcm</option>
        <option>TG_18-resolution-2k/TG18-LPH/TG18-LPH-2k-01.dcm</option>
        <option>TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-01.dcm</option>
        <option>TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-02.dcm</option>
        <option>TG_18-resolution-2k/TG18-LPV/TG18-LPV-2k-03.dcm</option>
        <option>TG_18-resolution-2k/TG18-PX/TG18-PX-2k-01.dcm</option>
        <option>TG_18-resolution-2k/TG18-RH/TG18-RH-2k-01.dcm</option>
        <option>TG_18-resolution-2k/TG18-RH/TG18-RH-2k-02.dcm</option>
        <option>TG_18-resolution-2k/TG18-RH/TG18-RH-2k-03.dcm</option>
        <option>TG_18-resolution-2k/TG18-RV/TG18-RV-2k-01.dcm</option>
        <option>TG_18-resolution-2k/TG18-RV/TG18-RV-2k-02.dcm</option>
        <option>TG_18-resolution-2k/TG18-RV/TG18-RV-2k-03.dcm</option>
    </optgroup>
    </select>

    <br>
    <br>
    <div class="row">
        <div class="col-md-6">
            <div id="cornerstone-element" style="width:512px;height:512px" onmousedown='return false;' oncontextmenu='return false;'>
            </div>
        </div>
        <div class="col-md-6">
            <span>Transfer Syntax: </span><span id="transferSyntax"></span><br>
            <span>SOP Class: </span><span id="sopClass"></span><br>
            <span>Samples Per Pixel: </span><span id="samplesPerPixel"></span><br>
            <span>Photometric Interpretation: </span><span id="photometricInterpretation"></span><br>
            <span>Number Of Frames: </span><span id="numberOfFrames"></span><br>
            <span>Planar Configuration: </span><span id="planarConfiguration"></span><br>
            <span>Rows: </span><span id="rows"></span><br>
            <span>Columns: </span><span id="columns"></span><br>
            <span>Pixel Spacing: </span><span id="pixelSpacing"></span><br>
            <span>Row Pixel Spacing: </span><span id="rowPixelSpacing"></span><br>
            <span>Column Pixel Spacing: </span><span id="columnPixelSpacing"></span><br>
            <span>Bits Allocated: </span><span id="bitsAllocated"></span><br>
            <span>Bits Stored: </span><span id="bitsStored"></span><br>
            <span>High Bit: </span><span id="highBit"></span><br>
            <span>Pixel Representation: </span><span id="pixelRepresentation"></span><br>
            <span>WindowCenter: </span><span id="windowCenter"></span><br>
            <span>WindowWidth: </span><span id="windowWidth"></span><br>
            <span>RescaleIntercept: </span><span id="rescaleIntercept"></span><br>
            <span>RescaleSlope: </span><span id="rescaleSlope"></span><br>
            <span>Basic Offset Table Entries: </span><span id="basicOffsetTable"></span><br>
            <span>Fragments: </span><span id="fragments"></span><br>
            <span>Max Stored Pixel Value: </span><span id="maxStoredPixelValue"></span><br>
            <span>Min Stored Pixel Value: </span><span id="minStoredPixelValue"></span><br>
            <span>Total Time: </span><span id="totalTime"></span><br>
            <span>Load Time: </span><span id="loadTime"></span><br>
            <span>Decode Time: </span><span id="decodeTime"></span><br>
        </div>
    </div>
</div>
`;

export default html;
