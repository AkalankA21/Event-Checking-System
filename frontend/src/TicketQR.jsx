import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";

export default function TicketQR({ ticket, onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previousFocus?.focus();
    };
  }, []);

  return createPortal(
    <dialog
      className="ticket-dialog"
      ref={dialogRef}
      aria-labelledby="qr-title"
      onCancel={onClose}
    >
      <div className="print-ticket">
        <p className="eyebrow">Event admission</p>
        <h2 id="qr-title">Your ticket QR</h2>
        <div className="ticket-qr">
          <QRCodeSVG
            value={ticket.reference}
            size={264}
            minVersion={2}
            level="H"
            boostLevel={false}
            marginSize={4}
            bgColor="#ffffff"
            fgColor="#000000"
            role="img"
            aria-label={`QR code for ${ticket.reference}`}
          />
        </div>
        <p className="printed-reference">{ticket.reference}</p>
        <p className="qr-type">{ticket.type} ticket</p>
        <span className={`badge ${ticket.checkedIn ? "used" : "ready"}`}>
          {ticket.checkedIn ? "Checked in" : "Not checked in"}
        </span>
      </div>
      <p className="qr-help">
        Present this code to the check-in camera, or type the printed reference.
        Each ticket can be checked in once.
      </p>
      <div className="dialog-actions">
        <button
          type="button"
          className="button primary"
          onClick={() => window.print()}
        >
          Print ticket
        </button>
        <button type="button" className="button secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
