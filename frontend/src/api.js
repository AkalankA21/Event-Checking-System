export class ApiError extends Error {
  constructor(status) {
    super(`Ticket API request failed (${status}).`);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    signal: AbortSignal.any([
      ...(options.signal ? [options.signal] : []),
      AbortSignal.timeout(10000),
    ]),
  });
  if (!response.ok) throw new ApiError(response.status);
  return response.json();
}

export function findTicket(reference, signal) {
  return request(`/api/tickets/${encodeURIComponent(reference)}`, { signal });
}

export function checkInTicket(reference, method, signal) {
  return request("/api/check-ins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference, method }),
    signal,
  });
}

export function fetchDashboard(signal) {
  return Promise.all([
    request("/api/admin/tickets", { signal }),
    request("/api/admin/summary", { signal }),
  ]).then(([tickets, summary]) => ({ tickets, summary }));
}

export function apiMessage(error) {
  if (error.status === 404)
    return {
      tone: "error",
      title: "Ticket not found",
      text: "No ticket matches this reference. Check the reference and try again.",
    };
  if (error.status === 409)
    return {
      tone: "warning",
      title: "Already checked in",
      text: "This ticket has already been used. No additional check-in was recorded.",
    };
  if (error.status === 400)
    return {
      tone: "error",
      title: "Invalid input",
      text: "Enter a valid ticket reference and try again.",
    };
  if (!error.status || error.status >= 500)
    return {
      tone: "error",
      title: "Backend unavailable",
      text: "We could not reach the check-in service. Check that the backend is running, then try again. If you were confirming a ticket, find it again to check its status before retrying.",
    };
  return {
    tone: "error",
    title: "Request failed",
    text: "The request could not be completed. Please try again.",
  };
}
