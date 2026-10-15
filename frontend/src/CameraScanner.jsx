import { useEffect, useRef, useState } from "react";

function cameraMessage(error) {
  if (
    error.name === "NotAllowedError" ||
    error.name === "PermissionDeniedError"
  )
    return "Camera permission denied. Allow camera access in your browser settings, or use manual entry.";
  if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError")
    return "No camera available. Connect a webcam, or use manual entry.";
  if (error.name === "NotReadableError" || error.name === "TrackStartError")
    return "Camera could not start. Close other apps using it, then try again or use manual entry.";
  return "Camera could not start. Check camera access and use localhost or HTTPS. Manual entry is still available.";
}

export default function CameraScanner({
  active,
  onStart,
  onStop,
  onScan,
  disabled,
}) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let accepted = false;
    let stream;
    let controls;
    const video = videoRef.current;

    function stopDecoder(scannerControls) {
      // Some camera/torch implementations return a Promise from stop().
      // Track cleanup must still run even if that optional device call fails.
      try {
        const stopped = scannerControls?.stop();
        if (stopped?.catch) void stopped.catch(() => {});
      } catch {
        /* Release our own tracks below regardless. */
      }
    }

    function release() {
      stopDecoder(controls);
      controls = undefined;
      stream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    }

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Camera API unavailable");
        }
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          release();
          return;
        }
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromStream(
          stream,
          video,
          (result, _error, scanControls) => {
            // Set this guard synchronously: callbacks can repeat before React rerenders.
            if (!result || cancelled || accepted) return;
            accepted = true;
            stopDecoder(scanControls);
            release();
            onScan(result.getText());
          },
        );
        if (cancelled || accepted) {
          release();
          return;
        }
        setReady(true);
      } catch (failure) {
        release();
        if (cancelled || accepted) return;
        setError(cameraMessage(failure));
        setReady(false);
        onStop();
      }
    }

    function stopOnLeave() {
      cancelled = true;
      release();
      onStop();
    }
    function stopWhenHidden() {
      if (document.hidden) stopOnLeave();
    }
    window.addEventListener("pagehide", stopOnLeave);
    document.addEventListener("visibilitychange", stopWhenHidden);
    void start();
    return () => {
      cancelled = true;
      release();
      window.removeEventListener("pagehide", stopOnLeave);
      document.removeEventListener("visibilitychange", stopWhenHidden);
    };
  }, [active, onScan, onStop]);

  function startCamera() {
    setError("");
    setReady(false);
    onStart();
  }

  return (
    <section className="panel scan-panel" aria-labelledby="scan-title">
      <div className="panel-heading">
        <span className="step">02</span>
        <div>
          <h2 id="scan-title">Scan a ticket</h2>
          <p>Use your camera to read a ticket QR code.</p>
        </div>
      </div>
      <div className={`camera-preview ${active ? "is-active" : ""}`}>
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          aria-label="QR scanning camera preview"
          hidden={!active}
        />
        {!active && (
          <div className="camera-placeholder">
            <span className="scan-symbol" aria-hidden="true">
              ⌗
            </span>
            <strong>Ready when you are</strong>
            <span>Your camera starts only when you choose.</span>
          </div>
        )}
        {active && (
          <>
            <div className="scan-guide" aria-hidden="true" />
            <span className="camera-caption">
              {ready ? "Hold the QR code inside the frame" : "Starting camera…"}
            </span>
          </>
        )}
      </div>
      <div className="camera-actions">
        <button
          className="button secondary"
          type="button"
          onClick={startCamera}
          disabled={disabled || active}
        >
          Scan QR code
        </button>
        {active && (
          <button className="button stop" type="button" onClick={onStop}>
            Stop Camera
          </button>
        )}
      </div>
      {error && (
        <p className="camera-error" role="alert">
          {error}
        </p>
      )}
      <p className="helper">
        One scan at a time. Review the ticket before confirming check-in.
      </p>
    </section>
  );
}
