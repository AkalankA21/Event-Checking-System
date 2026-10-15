import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

// Resolve backend dependencies from its own installation. No backend files change.
const backendRequire = createRequire(
  new URL("../../backend/package.json", import.meta.url),
);
await import(pathToFileURL(backendRequire.resolve("reflect-metadata")).href);
const { Test } = await import(
  pathToFileURL(backendRequire.resolve("@nestjs/testing")).href
);
const { getDataSourceToken } = await import(
  pathToFileURL(backendRequire.resolve("@nestjs/typeorm")).href
);
const { DataSource } = await import(
  pathToFileURL(backendRequire.resolve("typeorm")).href
);
const { AppModule } = await import("../../backend/dist/app.module.js");
const { databaseOptions } =
  await import("../../backend/dist/database/database.config.js");
const { seedTickets } =
  await import("../../backend/dist/database/seed-tickets.js");

const directory = await mkdtemp(join(tmpdir(), "event-frontend-e2e-"));
const testPath = join(directory, "frontend-test.sqlite");
const database = new DataSource({
  ...databaseOptions,
  database: testPath,
  synchronize: true,
});
const demo = new DataSource({ ...databaseOptions, synchronize: false });
const requests = [];
let app;
let vite;
async function snapshot(connection) {
  return {
    tickets: await connection.query("SELECT * FROM tickets ORDER BY id"),
    logs: await connection.query("SELECT * FROM check_in_logs ORDER BY id"),
  };
}

try {
  await demo.initialize();
  const demoBefore = await snapshot(demo);
  await database.initialize();
  await seedTickets(database);
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getDataSourceToken())
    .useValue(database)
    .compile();
  app = module.createNestApplication({ logger: false });
  await app.listen(0, "127.0.0.1");
  const target = await app.getUrl();
  // Only this isolated test server substitutes camera decoding. The normal
  // Vite server uses the real @zxing/browser implementation unchanged.
  const mockScanner = await readFile(
    new URL("./scanner-fixture.js", import.meta.url),
    "utf8",
  );
  vite = await createServer({
    optimizeDeps: { include: ["@zxing/library"] },
    plugins: [
      {
        name: "isolated-qr-test-fixture",
        enforce: "pre",
        resolveId(id) {
          if (id === "@zxing/browser") return "\0test-scanner";
        },
        load(id) {
          if (id === "\0test-scanner") return mockScanner;
        },
      },
    ],
    server: {
      host: "127.0.0.1",
      port: 5180,
      strictPort: true,
      proxy: {
        "/api": {
          target,
          changeOrigin: true,
          configure(proxy) {
            proxy.on("proxyRes", (response, request) => {
              requests.push({
                method: request.method,
                path: request.url,
                status: response.statusCode,
              });
            });
          },
        },
      },
    },
  });
  await vite.listen();
  console.log(
    `Isolated frontend: http://127.0.0.1:5180; temporary SQLite: ${testPath}`,
  );
  const require = createRequire(import.meta.url);
  const exitCode = await new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [
        require.resolve("@playwright/test/cli"),
        "test",
        ...process.argv.slice(2),
      ],
      { cwd: fileURLToPath(new URL("../", import.meta.url)) },
    );
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  assert.deepEqual(
    await snapshot(demo),
    demoBefore,
    "Demo rows must remain unchanged",
  );
  const results = await snapshot(database);
  const evidence = {
    temporaryDatabase: testPath,
    temporaryDatabaseRemovedAfterTests: true,
    demoUnchanged: true,
    demoTicketCount: demoBefore.tickets.length,
    demoCheckedIn: demoBefore.tickets.filter((ticket) => ticket.checkedIn)
      .length,
    demoLogCount: demoBefore.logs.length,
    requests,
    checkedInTestTickets: results.tickets.filter((ticket) => ticket.checkedIn),
    testLogs: results.logs,
    cameraTesting:
      "Simulated media access and decoder callbacks only; no physical webcam or optical QR scan tested.",
  };
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/database-verification.json",
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    `Demo database unchanged. HTTP/SQLite evidence: frontend/test-results/database-verification.json`,
  );
  process.exitCode = exitCode;
} finally {
  if (vite) await vite.close();
  if (app) await app.close();
  if (database.isInitialized) await database.destroy();
  if (demo.isInitialized) await demo.destroy();
  await rm(directory, { recursive: true, force: true });
}
