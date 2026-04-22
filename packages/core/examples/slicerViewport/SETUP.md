# Slicer Remote Viewport — setup

This example renders slices produced by 3D Slicer's bundled **Web Server**
module inside a cornerstone3D viewport. Slicer runs locally, fetches the
DICOMweb study itself, and serves PNG slices on `GET /slice?...`. The
browser handles pan, zoom, scroll, and annotations on top of those PNGs.

## 1. Install 3D Slicer

Download the latest stable Slicer 5.x for your platform:
https://download.slicer.org/

## 2. Enable and start the Web Server module

1. Launch Slicer.
2. In the module search bar (top-left) type **Web Server** and select it.
   The Web Server module ships with Slicer 5.x — no extension install
   needed.
3. Expand **Advanced** and enable these (they default to off):
   - **CORS** — required so the browser can call Slicer across origins.
   - **Slicer API exec** — enables `POST /slicer/exec`. This example
     drives everything through `/slicer/exec`: a Python snippet calls
     `DICOMUtils.importFromDICOMWeb` + `loadSeriesByUID` to download
     and load the study, and a second snippet queries the volume's
     slice count and spacing. (We don't use the `POST
     /accessDICOMwebStudy` endpoint because its handler is broken in
     Slicer 5.11 — `SlicerRequestHandler.py:670` wraps the parsed JSON
     body in a tuple and then indexes it as a dict, returning 500.)
4. Click **Start server**. The Slicer log panel should show
   `Listening on port 2016`. If port 2016 is in use, Slicer falls back to
   2017, 2018, …; in that case edit `SLICER_SERVER` at the top of
   `index.ts` or call `viewport.setServer('http://localhost:2017')`.

Leave Slicer open while you use the example.

## 3. Point to a DICOMweb server

`index.ts` defaults to a local Orthanc at `http://localhost:8042/dicom-web`.
If you are running the standard cornerstone3D local Orthanc setup, this
just works. Otherwise edit `wadoRsRoot` and `StudyInstanceUID` at the
top of `index.ts` to point at your PACS.

Slicer's `POST /accessDICOMwebStudy` uses `dicomweb_client` under the
hood, which performs full multipart WADO-RS series retrieves. This works
against real PACS (Orthanc, dcm4chee) but **fails** against static /
CloudFront-backed DICOMweb servers that only expose QIDO + per-frame
WADO-RS.

## 4. Run the example

From the repo root:

```
yarn example slicerViewport
```

The example page will automatically:
1. `POST http://localhost:2016/slicer/exec` with a Python snippet that
   calls `DICOMUtils.importFromDICOMWeb` (Slicer's bundled
   `dicomweb_client`) — Slicer fetches the study via full WADO-RS
   multipart retrieves, adds it to its DICOM database, and loads it
   into the scene with `loadSeriesByUID`.
2. `POST http://localhost:2016/slicer/exec` again to read the volume's
   slice count, spacing, and axial bounds.
3. `GET http://localhost:2016/slicer/slice?view=red&offset=<mm>&size=512`
   each time the current slice changes.

### Using Slicer's bundled sample volume instead

`SlicerViewport.loadSampleData(name)` runs Slicer's `SampleData` module
loader (`MRHead`, `CTChest`, `CTACardio`, `MRBrainTumor1`, ...). No
external network is involved at all. Swap the call in `index.ts`:
```ts
// await viewport.loadDicomStudy({ wadoRsRoot, StudyInstanceUID });
await viewport.loadSampleData('MRHead');
```

## 5. Interaction

- **Scroll wheel** — step through slices (fires a new `GET /slice`).
- **Right-drag** — zoom. Client-side.
- **Middle-drag** — pan. The PNG is transformed client-side; no refetch.
- **Left-click (Length / Probe)** — place annotations. They are tagged
  with the slice index they were drawn on and disappear when you scroll
  away.
- **Orientation dropdown** — switches between axial, sagittal, coronal.
  Triggers a geometry re-query and a fresh fetch.

## Troubleshooting

- **CORS error in the browser console** — the CORS checkbox is off or
  the server was not restarted after you toggled it. Stop and start the
  Web Server in Slicer.
- **HTTP 500 on `/slicer/exec`** — either **Slicer API exec** is off
  (enable it in the Web Server module Advanced panel and restart the
  server), or the Python snippet hit a runtime error — check the Slicer
  Python console for a traceback. Common causes of the latter: the
  PACS is not reachable from Slicer's process, or the study UID does
  not exist on that PACS.
- **Blank viewport, no network errors** — open
  `http://localhost:2016/slicer/slice?view=red&size=512` in a new tab.
  If that is blank, the study did not load inside Slicer. Open Slicer's
  Python console and re-check that
  `slicer.mrmlScene.GetNodesByClass('vtkMRMLScalarVolumeNode')` returns
  at least one node.
- **Scroll feels sluggish** — each scroll tick fetches a fresh PNG.
  Localhost round-trip is the floor. Debouncing is intentionally out of
  scope for this example.
