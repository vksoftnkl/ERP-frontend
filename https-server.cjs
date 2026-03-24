const { existsSync, readFileSync } = require("node:fs");
const { createServer } = require("node:https");
const { resolve } = require("node:path");
const next = require("next");

const hostname = process.env.HOST || "0.0.0.0";
const port = Number.parseInt(process.env.PORT || "3000", 10);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`);
}

const certPath = resolve(
  process.cwd(),
  process.env.HTTPS_CERT_PATH || "../ERP server/certs/server.crt",
);
const keyPath = resolve(
  process.cwd(),
  process.env.HTTPS_KEY_PATH || "../ERP server/certs/server.key",
);

if (!existsSync(certPath)) {
  throw new Error(`HTTPS certificate not found at: ${certPath}`);
}

if (!existsSync(keyPath)) {
  throw new Error(`HTTPS key not found at: ${keyPath}`);
}

const httpsOptions = {
  cert: readFileSync(certPath),
  key: readFileSync(keyPath),
  passphrase: process.env.HTTPS_PASSPHRASE || undefined,
};

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer(httpsOptions, (req, res) => {
      void handle(req, res);
    }).listen(port, hostname, () => {
      const hostForDisplay = hostname === "0.0.0.0" ? "localhost" : hostname;
      console.log(`> ERP client ready on https://${hostForDisplay}:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start HTTPS Next.js server:", error);
    process.exit(1);
  });
