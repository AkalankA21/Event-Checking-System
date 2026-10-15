import { expect, test } from "@playwright/test";

async function openDashboard(page) {
  await page
    .getByRole("button", { name: "Admin Dashboard", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "All tickets", exact: true }),
  ).toBeVisible();
}

function ticketRow(page, reference) {
  return page.getByRole("row").filter({
    has: page.getByRole("rowheader", { name: reference, exact: true }),
  });
}

async function expectCount(page, label, count) {
  await expect(
    page
      .locator(".stat-card")
      .filter({ has: page.getByRole("heading", { name: label, exact: true }) })
      .locator("p"),
  ).toHaveText(String(count));
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("dashboard shows initial tickets and counts, then refreshes on navigation and Refresh after check-ins", async ({
  page,
}) => {
  await openDashboard(page);
  await expectCount(page, "Total tickets", 15);
  await expectCount(page, "Checked in", 0);
  await expectCount(page, "Not checked in", 15);
  await expect(
    page.getByText("Unauthenticated admin access.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(15);
  const references = await page.locator("tbody th").allTextContents();
  expect(references).toEqual([...references].sort());
  for (const type of ["VIP", "Standard", "Student"]) {
    const entry = page
      .locator(".type-grid > div")
      .filter({ has: page.getByRole("heading", { name: type, exact: true }) });
    await expect(entry.locator("strong")).toHaveText("0");
    await expect(entry).toContainText("/ 5 tickets");
  }

  await page.getByRole("button", { name: "Check-in", exact: true }).click();
  await page
    .getByLabel("Ticket reference", { exact: true })
    .fill("EVT-VIP-003");
  await page.getByRole("button", { name: "Find ticket", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm check-in", exact: true })
    .click();
  await expect(
    page.getByText("Check-in successful", { exact: true }),
  ).toBeVisible();
  await openDashboard(page);
  await expectCount(page, "Checked in", 1);
  await expectCount(page, "Not checked in", 14);
  await expect(
    ticketRow(page, "EVT-VIP-003").getByText("Checked in", { exact: true }),
  ).toBeVisible();
  await expect(ticketRow(page, "EVT-VIP-003").locator("time")).toBeVisible();
  await expect(
    page
      .locator(".type-grid > div")
      .filter({ has: page.getByRole("heading", { name: "VIP", exact: true }) })
      .locator("strong"),
  ).toHaveText("1");

  const checkIn = await page.request.post("/api/check-ins", {
    data: { reference: "EVT-STUDENT-003", method: "QR" },
  });
  expect(checkIn.status()).toBe(201);
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expectCount(page, "Checked in", 2);
  await expectCount(page, "Not checked in", 13);
  await expect(
    ticketRow(page, "EVT-STUDENT-003").getByText("Checked in", { exact: true }),
  ).toBeVisible();
});

test("loading, empty, and failed dashboard requests provide usable states and recovery", async ({
  page,
}) => {
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/**", async (route) => {
    await hold;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Admin Dashboard", exact: true })
    .click();
  await expect(
    page.getByText("Loading dashboard…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refreshing…" }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByRole("heading", { name: "All tickets", exact: true }),
  ).toBeVisible();
  await page.unroute("**/api/admin/**");

  await page.route("**/api/admin/tickets", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("**/api/admin/summary", (route) =>
    route.fulfill({
      json: {
        total: 0,
        checkedIn: 0,
        notCheckedIn: 0,
        byType: ["VIP", "Standard", "Student"].map((type) => ({
          type,
          total: 0,
          checkedIn: 0,
          notCheckedIn: 0,
        })),
      },
    }),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(
    page.getByText("No tickets yet.", { exact: false }),
  ).toBeVisible();
  await expectCount(page, "Total tickets", 0);
  await page.unroute("**/api/admin/tickets");
  await page.unroute("**/api/admin/summary");

  await page.route("**/api/admin/summary", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Dashboard unavailable");
  await expect(page.locator(".stat-grid")).toHaveCount(0);
  await page.unroute("**/api/admin/summary");
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expectCount(page, "Total tickets", 15);
});

test("every generated QR decodes to its exact reference with the real ZXing reader, including checked-in tickets", async ({
  page,
}) => {
  await openDashboard(page);
  const response = await page.request.get("/api/admin/tickets");
  expect(response.status()).toBe(200);
  const tickets = await response.json();
  expect(tickets).toHaveLength(15);
  const decoded = [];
  for (const ticket of tickets) {
    await page
      .getByRole("button", {
        name: `View QR for ${ticket.reference}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText(ticket.reference, { exact: true }),
    ).toBeVisible();
    const value = await page.evaluate(async () => {
      // Bypass the camera-only test fixture and use the actual scanner package.
      const { BrowserQRCodeReader } =
        await import("/node_modules/@zxing/browser/esm/index.js");
      const svg = document.querySelector(".ticket-qr svg");
      const url = URL.createObjectURL(
        new Blob([new XMLSerializer().serializeToString(svg)], {
          type: "image/svg+xml",
        }),
      );
      try {
        return (
          await new BrowserQRCodeReader().decodeFromImageUrl(url)
        ).getText();
      } finally {
        URL.revokeObjectURL(url);
      }
    });
    expect(value).toBe(ticket.reference);
    decoded.push(value);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
  }
  await test.info().attach("exact-decoded-references", {
    body: JSON.stringify(decoded, null, 2),
    contentType: "application/json",
  });
  const duplicate = await page.request.post("/api/check-ins", {
    data: { reference: "EVT-VIP-003", method: "QR" },
  });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).message).toBe(
    "Ticket has already been checked in.",
  );
});

test("selected ticket print layout excludes the dashboard and the dialog is keyboard accessible", async ({
  page,
}) => {
  await openDashboard(page);
  const trigger = page.getByRole("button", {
    name: "View QR for EVT-STANDARD-002",
    exact: true,
  });
  await trigger.click();
  await page.evaluate(() => {
    window.__printCalls = 0;
    window.print = () => {
      window.__printCalls++;
    };
  });
  await page.getByRole("button", { name: "Print ticket", exact: true }).click();
  expect(await page.evaluate(() => window.__printCalls)).toBe(1);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#root")).toBeHidden();
  await expect(page.locator(".ticket-qr svg")).toBeVisible();
  await expect(
    page
      .getByText("EVT-STANDARD-002", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Print ticket", exact: true }),
  ).toBeHidden();
  await page.screenshot({
    path: "test-results/selected-ticket-print.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("navigating to the dashboard releases the active check-in camera", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__camera = { trackStops: 0, decoderStops: 0 };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [
            {
              stop() {
                window.__camera.trackStops++;
              },
            },
          ],
        }),
      },
    });
  });
  await page.getByRole("button", { name: "Scan QR code" }).click();
  await expect(
    page.getByText("Hold the QR code inside the frame"),
  ).toBeVisible();
  await openDashboard(page);
  await expect
    .poll(() => page.evaluate(() => window.__camera.trackStops))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Check-in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Scan QR code" }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: "Stop Camera" })).toHaveCount(
    0,
  );
});

test("dashboard and QR dialog fit desktop and mobile viewports", async ({
  page,
}) => {
  await openDashboard(page);
  for (const [name, width] of [
    ["desktop", 1280],
    ["mobile", 375],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/dashboard-${name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "View QR for EVT-VIP-003", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page
        .getByRole("dialog")
        .evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
});
