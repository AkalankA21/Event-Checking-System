import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__camera = {
      mode: "ready",
      requests: 0,
      trackStops: 0,
      decoderStops: 0,
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.__camera.requests++;
          if (window.__camera.mode === "denied")
            throw new DOMException("denied", "NotAllowedError");
          if (window.__camera.mode === "missing")
            throw new DOMException("missing", "NotFoundError");
          if (window.__camera.mode === "pending")
            await new Promise((resolve) => {
              window.__camera.resolve = resolve;
            });
          return {
            getTracks: () => [
              {
                stop() {
                  window.__camera.trackStops++;
                  sessionStorage.setItem("camera-stopped", "yes");
                },
              },
            ],
          };
        },
      },
    });
  });
  await page.goto("/");
});

async function lookup(page, reference) {
  await page.getByLabel("Ticket reference", { exact: true }).fill(reference);
  await page.getByRole("button", { name: "Find ticket", exact: true }).click();
}

test("manual lookup is read-only, and confirmation sends exactly one MANUAL check-in", async ({
  page,
}) => {
  await lookup(page, "EVT-VIP-001");
  await expect(
    page.getByRole("heading", { name: "EVT-VIP-001" }),
  ).toBeVisible();
  await expect(
    page.getByText("Ready to check in", { exact: true }),
  ).toBeVisible();
  const before = await page.request.get("/api/tickets/EVT-VIP-001");
  expect(before.status()).toBe(200);
  expect((await before.json()).checkedIn).toBe(false);
  let release;
  const hold = new Promise((resolve) => {
    release = resolve;
  });
  const posts = [];
  await page.route("**/api/check-ins", async (route) => {
    posts.push(route.request().postDataJSON());
    await hold;
    await route.continue();
  });
  await page.getByRole("button", { name: "Confirm check-in" }).dblclick();
  await expect(
    page.getByRole("button", { name: "Checking in…" }),
  ).toBeDisabled();
  release();
  await expect(
    page.getByText("Check-in successful", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("time")).toBeVisible();
  expect(posts).toEqual([{ reference: "EVT-VIP-001", method: "MANUAL" }]);
  const after = await page.request.get("/api/tickets/EVT-VIP-001");
  expect((await after.json()).checkedIn).toBe(true);
  await page.getByRole("button", { name: "Next ticket" }).click();
  await lookup(page, "EVT-VIP-001");
  await expect(
    page.getByText("Already checked in", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm check-in" }),
  ).toHaveCount(0);
});

test("invalid input, real 404, simulated 400, and network failure have distinct messages", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Find ticket", exact: true }).click();
  await expect(page.getByText("Invalid input", { exact: true })).toBeVisible();
  await lookup(page, "UNKNOWN");
  await expect(
    page.getByText("Ticket not found", { exact: true }),
  ).toBeVisible();
  await page.route("**/api/tickets/BAD-INPUT", (route) =>
    route.fulfill({ status: 400, contentType: "application/json", body: "{}" }),
  );
  await lookup(page, "BAD-INPUT");
  await expect(page.getByText("Invalid input", { exact: true })).toBeVisible();
  await page.route("**/api/tickets/UNAVAILABLE", (route) =>
    route.abort("connectionrefused"),
  );
  await lookup(page, "UNAVAILABLE");
  await expect(
    page.getByText("Backend unavailable", { exact: true }),
  ).toBeVisible();
});

test("a real 409 after another operator checks in refreshes status without a duplicate log", async ({
  page,
}) => {
  await lookup(page, "EVT-VIP-002");
  await expect(
    page.getByRole("button", { name: "Confirm check-in" }),
  ).toBeVisible();
  const otherOperator = await page.request.post("/api/check-ins", {
    data: { reference: "EVT-VIP-002", method: "MANUAL" },
  });
  expect(otherOperator.status()).toBe(201);
  const duplicate = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/check-ins") && response.status() === 409,
  );
  await page.getByRole("button", { name: "Confirm check-in" }).click();
  await duplicate;
  await expect(
    page.getByText("Already checked in", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm check-in" }),
  ).toHaveCount(0);
  await expect(page.locator("time")).toBeVisible();
});

test("simulated QR decode stops scanning, ignores repeated callbacks, and requires QR confirmation", async ({
  page,
}) => {
  let lookups = 0;
  let posts = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/tickets/EVT-STANDARD-001")) lookups++;
    if (request.method() === "POST") posts++;
  });
  await page.getByRole("button", { name: "Scan QR code" }).click();
  await expect(
    page.getByText("Hold the QR code inside the frame"),
  ).toBeVisible();
  await page.evaluate(() => {
    window.__camera.decode("EVT-STANDARD-001");
    window.__camera.decode("EVT-STANDARD-001");
  });
  await expect(
    page.getByRole("heading", { name: "EVT-STANDARD-001" }),
  ).toBeVisible();
  expect(lookups).toBe(1);
  expect(posts).toBe(0);
  expect(await page.evaluate(() => window.__camera.trackStops)).toBeGreaterThan(
    0,
  );
  await expect(page.getByRole("button", { name: "Stop Camera" })).toHaveCount(
    0,
  );
  const checkedIn = page.waitForResponse((response) =>
    response.url().endsWith("/api/check-ins"),
  );
  await page.getByRole("button", { name: "Confirm check-in" }).click();
  const response = await checkedIn;
  expect(response.status()).toBe(201);
  expect((await response.json()).method).toBe("QR");
  await expect(
    page.getByText("Check-in successful", { exact: true }),
  ).toBeVisible();
  expect(posts).toBe(1);
});

test("camera permission denied and missing camera keep manual lookup usable", async ({
  page,
}) => {
  for (const [mode, message] of [
    ["denied", "Camera permission denied."],
    ["missing", "No camera available."],
  ]) {
    await page.evaluate((value) => {
      window.__camera.mode = value;
    }, mode);
    await page.getByRole("button", { name: "Scan QR code" }).click();
    await expect(page.getByRole("alert")).toContainText(message);
    await lookup(page, "EVT-STUDENT-001");
    await expect(
      page.getByRole("button", { name: "Confirm check-in" }),
    ).toBeVisible();
  }
});

test("Stop Camera and page navigation release streams", async ({ page }) => {
  await page.getByRole("button", { name: "Scan QR code" }).click();
  await expect(
    page.getByText("Hold the QR code inside the frame"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop Camera" }).click();
  expect(await page.evaluate(() => window.__camera.trackStops)).toBeGreaterThan(
    0,
  );
  await page.evaluate(() => sessionStorage.removeItem("camera-stopped"));
  await page.getByRole("button", { name: "Scan QR code" }).click();
  await expect(
    page.getByText("Hold the QR code inside the frame"),
  ).toBeVisible();
  await page.goto("/?after-navigation");
  expect(
    await page.evaluate(() => sessionStorage.getItem("camera-stopped")),
  ).toBe("yes");
});

test("stopping during camera permission startup also releases a late stream", async ({
  page,
}) => {
  await page.evaluate(() => {
    window.__camera.mode = "pending";
  });
  await page.getByRole("button", { name: "Scan QR code" }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__camera.resolve)))
    .toBe(true);
  await page.getByRole("button", { name: "Stop Camera" }).click();
  await page.evaluate(() => window.__camera.resolve());
  await expect
    .poll(() => page.evaluate(() => window.__camera.trackStops))
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Scan QR code" }),
  ).toBeEnabled();
});

test("desktop and mobile layout fit the viewport, and manual entry works from the keyboard", async ({
  page,
}) => {
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
      path: `test-results/check-in-${name}.png`,
      fullPage: true,
    });
  }
  await page
    .getByLabel("Ticket reference", { exact: true })
    .fill("EVT-STUDENT-002");
  await page.getByLabel("Ticket reference", { exact: true }).press("Enter");
  await expect(
    page.getByRole("heading", { name: "EVT-STUDENT-002" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm check-in" }),
  ).toBeVisible();
});
