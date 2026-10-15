// Loaded by the isolated test server only. No QR images are generated.
export class BrowserQRCodeReader {
  async decodeFromStream(_stream, _video, callback) {
    const controls = {
      stop() {
        window.__camera.decoderStops++;
      },
    };
    window.__camera.decode = (reference) =>
      callback({ getText: () => reference }, undefined, controls);
    return controls;
  }
}
