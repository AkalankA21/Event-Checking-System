import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDashboard } from "./api.js";
import TicketQR from "./TicketQR.jsx";

function displayTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(timestamp));
}

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);
  const requestRef = useRef(null);

  const refresh = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(false);
    try {
      const result = await fetchDashboard(controller.signal);
      if (!controller.signal.aborted) setData(result);
    } catch {
      if (!controller.signal.aborted) {
        setData(null);
        setError(true);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => requestRef.current?.abort();
  }, [refresh]);

  return (
    <main>
      <section className="intro dashboard-intro">
        <div>
          <p className="eyebrow">Event overview</p>
          <h1>Admin Dashboard</h1>
          <p>Guest arrivals and ticket QR codes, in one place.</p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </section>
      <p className="mvp-note">
        Local MVP · Unauthenticated admin access. This dashboard is not
        access-controlled.
      </p>
      {loading && (
        <p className="loading" role="status">
          Loading dashboard…
        </p>
      )}
      {error && (
        <div className="notice error" role="alert">
          <strong>Dashboard unavailable</strong>
          <p>
            Could not load the dashboard. Check that the backend is running,
            then select Refresh to try again.
          </p>
        </div>
      )}
      {!loading && !error && data && (
        <div className="dashboard-content">
          <section className="stat-grid" aria-label="Overall ticket counts">
            {[
              ["Total tickets", data.summary.total],
              ["Checked in", data.summary.checkedIn],
              ["Not checked in", data.summary.notCheckedIn],
            ].map(([label, value]) => (
              <div className="panel stat-card" key={label}>
                <h2>{label}</h2>
                <p>{value}</p>
              </div>
            ))}
          </section>
          <section
            className="panel type-summary"
            aria-labelledby="type-summary-title"
          >
            <h2 id="type-summary-title">Arrivals by ticket type</h2>
            <div className="type-grid">
              {data.summary.byType.map((entry) => (
                <div key={entry.type}>
                  <h3>{entry.type}</h3>
                  <p>
                    <strong>{entry.checkedIn}</strong> checked in{" "}
                    <span>/ {entry.total} tickets</span>
                  </p>
                  <small>{entry.notCheckedIn} not checked in</small>
                </div>
              ))}
            </div>
          </section>
          <section
            className="panel ticket-list"
            aria-labelledby="all-tickets-title"
          >
            <div className="ticket-list-heading">
              <h2 id="all-tickets-title">All tickets</h2>
              <span>{data.tickets.length} tickets</span>
            </div>
            {data.tickets.length === 0 ? (
              <p className="empty-dashboard">
                No tickets yet. Tickets will appear here once they are added to
                the backend.
              </p>
            ) : (
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label="All tickets table, scroll horizontally on smaller screens"
              >
                <table>
                  <caption className="sr-only">
                    Ticket references, types, check-in statuses, times, and QR
                    actions
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Reference</th>
                      <th scope="col">Type</th>
                      <th scope="col">Status</th>
                      <th scope="col">Check-in time</th>
                      <th scope="col">Ticket QR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tickets.map((ticket) => (
                      <tr key={ticket.reference}>
                        <th scope="row">{ticket.reference}</th>
                        <td>{ticket.type}</td>
                        <td>
                          <span
                            className={`badge ${ticket.checkedIn ? "used" : "ready"}`}
                          >
                            {ticket.checkedIn ? "Checked in" : "Not checked in"}
                          </span>
                        </td>
                        <td>
                          {ticket.checkedInAt ? (
                            <time dateTime={ticket.checkedInAt}>
                              {displayTime(ticket.checkedInAt)}
                            </time>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="button secondary qr-action"
                            aria-label={`View QR for ${ticket.reference}`}
                            onClick={() => setSelected(ticket)}
                          >
                            View QR
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
      {selected && (
        <TicketQR ticket={selected} onClose={() => setSelected(null)} />
      )}
    </main>
  );
}
