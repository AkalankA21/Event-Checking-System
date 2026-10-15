import { useState } from "react";
import CheckInScreen from "./CheckInScreen.jsx";
import AdminDashboard from "./AdminDashboard.jsx";
import "./App.css";

export default function App() {
  const [page, setPage] = useState("check-in");

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Event Check-in home">
          <span className="brand-mark" aria-hidden="true">
            ✓
          </span>
          Event Check-in
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            type="button"
            aria-current={page === "check-in" ? "page" : undefined}
            onClick={() => setPage("check-in")}
          >
            Check-in
          </button>
          <button
            type="button"
            aria-current={page === "admin" ? "page" : undefined}
            onClick={() => setPage("admin")}
          >
            Admin Dashboard
          </button>
        </nav>
      </header>
      {page === "check-in" ? <CheckInScreen /> : <AdminDashboard />}
      <footer>
        <span>Event Check-in System</span>
        <span>One ticket. One welcome.</span>
      </footer>
    </div>
  );
}
