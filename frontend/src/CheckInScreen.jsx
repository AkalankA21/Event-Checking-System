import { useCallback, useEffect, useRef, useState } from "react";
import CameraScanner from "./CameraScanner.jsx";
import { apiMessage, checkInTicket, findTicket } from "./api.js";
import "./App.css";

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(value));
}

export default function CheckInScreen() {
  const [reference, setReference] = useState("");
  const [selection, setSelection] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const requestRef = useRef(null);
  const resultRef = useRef(null);
  const stopCamera = useCallback(() => setCameraActive(false), []);

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (selection) resultRef.current?.focus();
  }, [selection]);

  const lookup = useCallback(async (value, method) => {
    if (requestRef.current) return;
    setSelection(null);
    setNotice(null);
    if (!value.trim()) {
      setNotice({
        tone: "error",
        title: "Invalid input",
        text: "Enter a ticket reference first.",
      });
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy("lookup");
    try {
      const ticket = await findTicket(value, controller.signal);
      setSelection({ ticket, method });
      if (ticket.checkedIn)
        setNotice({
          tone: "warning",
          title: "Already checked in",
          text: "This ticket has already been used. It cannot be checked in again.",
        });
    } catch (error) {
      if (!controller.signal.aborted) setNotice(apiMessage(error));
    } finally {
      requestRef.current = null;
      setBusy("");
    }
  }, []);

  const handleScan = useCallback(
    (value) => {
      setCameraActive(false);
      setReference(value);
      void lookup(value, "QR");
    },
    [lookup],
  );

  function handleManual(event) {
    event.preventDefault();
    stopCamera();
    void lookup(reference.trim(), "MANUAL");
  }

  async function confirmCheckIn() {
    if (!selection || selection.ticket.checkedIn || requestRef.current) return;
    stopCamera();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy("check-in");
    setNotice(null);
    try {
      const ticket = await checkInTicket(
        selection.ticket.reference,
        selection.method,
        controller.signal,
      );
      setSelection({ ticket, method: ticket.method });
      setNotice({
        tone: "success",
        title: "Check-in successful",
        text: "The ticket has been checked in. Welcome to the event!",
      });
    } catch (error) {
      if (!controller.signal.aborted) {
        if (error.status === 409) {
          // Another operator may have used the ticket after our lookup.
          setSelection(null);
          try {
            const ticket = await findTicket(
              selection.ticket.reference,
              controller.signal,
            );
            setSelection({ ticket, method: selection.method });
          } catch {
            /* Keep the duplicate message even if the refresh fails. */
          }
        }
        if (error.status === 404) setSelection(null);
        setNotice(apiMessage(error));
      }
    } finally {
      requestRef.current = null;
      setBusy("");
    }
  }

  function reset() {
    stopCamera();
    setReference("");
    setSelection(null);
    setNotice(null);
    document.getElementById("ticket-reference")?.focus();
  }

  return (
    <main>
      <section className="intro">
        <p className="eyebrow">A warm welcome starts here</p>
        <h1>
          Good to see you.
          <br />
          <span>Let’s get you checked in.</span>
        </h1>
        <p>
          Find a ticket by reference or scan its QR code, then confirm the
          guest’s arrival.
        </p>
      </section>
      <div className="entry-grid" aria-busy={Boolean(busy)}>
        <section className="panel manual-panel" aria-labelledby="manual-title">
          <div className="panel-heading">
            <span className="step">01</span>
            <div>
              <h2 id="manual-title">Find a ticket</h2>
              <p>Enter the reference from the guest’s ticket.</p>
            </div>
          </div>
          <form onSubmit={handleManual} noValidate>
            <label htmlFor="ticket-reference">Ticket reference</label>
            <input
              id="ticket-reference"
              value={reference}
              onChange={(event) => {
                setReference(event.target.value);
                setSelection(null);
                setNotice(null);
              }}
              placeholder="e.g. EVT-VIP-001"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={Boolean(busy)}
              aria-describedby="reference-help"
            />
            <p className="helper" id="reference-help">
              References are case-sensitive. Include any dashes.
            </p>
            <button
              className="button primary find-button"
              type="submit"
              disabled={Boolean(busy)}
            >
              {busy === "lookup" ? "Finding ticket…" : "Find ticket"}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <div className="manual-note">
            <span aria-hidden="true">↳</span>
            <p>
              No camera? No problem.
              <br />
              Manual entry works on its own.
            </p>
          </div>
        </section>
        <CameraScanner
          active={cameraActive}
          onStart={() => {
            setSelection(null);
            setNotice(null);
            setCameraActive(true);
          }}
          onStop={stopCamera}
          onScan={handleScan}
          disabled={Boolean(busy)}
        />
      </div>
      <div className="result-area" aria-busy={Boolean(busy)}>
        {notice && (
          <div
            className={`notice ${notice.tone}`}
            role={
              notice.tone === "error" || notice.tone === "warning"
                ? "alert"
                : "status"
            }
          >
            <strong>{notice.title}</strong>
            <p>{notice.text}</p>
          </div>
        )}
        {busy === "lookup" && (
          <p className="loading" role="status">
            Looking up your ticket…
          </p>
        )}
        {selection ? (
          <section
            className="panel ticket-result"
            aria-labelledby="ticket-title"
            ref={resultRef}
            tabIndex={-1}
          >
            <div className="result-heading">
              <div>
                <p className="eyebrow">Ticket details</p>
                <h2 id="ticket-title">{selection.ticket.reference}</h2>
              </div>
              <span
                className={`badge ${selection.ticket.checkedIn ? "used" : "ready"}`}
              >
                {selection.ticket.checkedIn
                  ? "Checked in"
                  : "Ready to check in"}
              </span>
            </div>
            <dl>
              <div>
                <dt>Ticket type</dt>
                <dd>{selection.ticket.type}</dd>
              </div>
              <div>
                <dt>Entry method</dt>
                <dd>
                  {selection.method === "QR" ? "QR scan" : "Manual entry"}
                </dd>
              </div>
              <div>
                <dt>Check-in time</dt>
                <dd>
                  {selection.ticket.checkedInAt ? (
                    <time dateTime={selection.ticket.checkedInAt}>
                      {formatTime(selection.ticket.checkedInAt)}
                    </time>
                  ) : (
                    "Not checked in yet"
                  )}
                </dd>
              </div>
            </dl>
            <div className="result-actions">
              {!selection.ticket.checkedIn && (
                <button
                  className="button primary"
                  type="button"
                  onClick={confirmCheckIn}
                  disabled={Boolean(busy)}
                >
                  {busy === "check-in" ? "Checking in…" : "Confirm check-in"}
                </button>
              )}
              <button
                className="button secondary"
                type="button"
                onClick={reset}
                disabled={Boolean(busy)}
              >
                Next ticket
              </button>
            </div>
          </section>
        ) : (
          !busy &&
          !notice && (
            <div className="empty-result">
              <span aria-hidden="true">✓</span>
              <p>
                Find or scan a ticket to see its details here.
                <br />
                <small>Check-in happens only after you confirm.</small>
              </p>
            </div>
          )
        )}
      </div>
    </main>
  );
}
