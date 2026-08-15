#!/usr/bin/env node
/**
 * Generates a TLS certificate for local development.
 *
 * Output: certs/localhost.crt + certs/localhost.key (gitignored).
 *
 * Prefers mkcert, which signs with a CA installed in the local browser trust
 * stores, so browsers show no warning. Falls back to a self-signed openssl cert
 * when mkcert is unavailable — that works, but browsers will warn.
 *
 * To get the trusted path, install mkcert and register its CA:
 *   sudo apt install mkcert libnss3-tools   # or: brew install mkcert nss
 *   mkcert -install
 *
 * LAN addresses are detected and added automatically so the URL that
 * `next dev` prints (see allowedDevOrigins in next.config.mjs) also validates.
 * Extra hosts can be appended as arguments:
 *   npm run cert:local -- erp.local 10.0.0.5
 *
 * Usage: npm run cert:local [-- --force] [extra hosts...]
 */
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { networkInterfaces } = require("node:os");
const { delimiter, join, resolve } = require("node:path");

const CERT_DIR = resolve(__dirname, "..", "certs");
const CERT_PATH = join(CERT_DIR, "localhost.crt");
const KEY_PATH = join(CERT_DIR, "localhost.key");
const CONFIG_PATH = join(CERT_DIR, "localhost.openssl.cnf");
const DAYS = 825;

const BASE_HOSTS = ["localhost", "127.0.0.1", "::1"];

// The frontend is routinely opened through the LAN URL `next dev` prints, so
// those addresses belong in the SAN list or the browser rejects the cert.
const findLanAddresses = () => {
  const addresses = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }
      addresses.push(entry.address);
    }
  }
  return addresses;
};

const isForced = process.argv.includes("--force");
const extraHosts = process.argv.slice(2).filter((arg) => arg !== "--force");
const hosts = [...new Set([...BASE_HOSTS, ...findLanAddresses(), ...extraHosts])];

const isIpAddress = (host) => /^[\d.]+$/.test(host) || host.includes(":");

const buildOpensslConfig = () => {
  const dnsEntries = [];
  const ipEntries = [];
  for (const host of hosts) {
    if (isIpAddress(host)) {
      ipEntries.push(`IP.${ipEntries.length + 1}  = ${host}`);
    } else {
      dnsEntries.push(`DNS.${dnsEntries.length + 1} = ${host}`);
    }
  }
  // Wildcard subdomains of localhost are handy for named local vhosts.
  dnsEntries.push(`DNS.${dnsEntries.length + 1} = *.localhost`);

  return `[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
CN = localhost
O  = ERP Client Local Development

[v3_req]
basicConstraints = CA:FALSE
keyUsage         = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName   = @alt_names

[alt_names]
${[...dnsEntries, ...ipEntries].join("\n")}
`;
};

// mkcert is often installed to a user-local bin that non-login shells miss.
const findMkcert = () => {
  const extraPaths = [join(process.env.HOME || "", ".local", "bin")];
  const searchPath = [process.env.PATH || "", ...extraPaths].join(delimiter);
  try {
    const found = execFileSync(process.platform === "win32" ? "where" : "which", ["mkcert"], {
      env: { ...process.env, PATH: searchPath },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return found.split(/\r?\n/)[0].trim() || null;
  } catch {
    return null;
  }
};

const generateWithMkcert = (mkcertPath) => {
  execFileSync(mkcertPath, ["-key-file", KEY_PATH, "-cert-file", CERT_PATH, ...hosts], {
    stdio: "inherit",
  });
  console.log("");
  console.log("Signed by the mkcert local CA — trusted by browsers that have run `mkcert -install`.");
};

const generateWithOpenssl = () => {
  writeFileSync(CONFIG_PATH, buildOpensslConfig());
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-nodes",
        "-newkey",
        "rsa:2048",
        "-days",
        String(DAYS),
        "-keyout",
        KEY_PATH,
        "-out",
        CERT_PATH,
        "-config",
        CONFIG_PATH,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
  } finally {
    rmSync(CONFIG_PATH, { force: true });
  }
  console.log(`Generated self-signed certificate (valid ${DAYS} days).`);
  console.log("");
  console.log("Self-signed: browsers will warn. Install mkcert and re-run for a trusted cert.");
};

if (existsSync(CERT_PATH) && existsSync(KEY_PATH) && !isForced) {
  console.log(`Certificate already exists at ${CERT_PATH}. Re-run with --force to regenerate.`);
  process.exit(0);
}

mkdirSync(CERT_DIR, { recursive: true });

const mkcertPath = findMkcert();

try {
  if (mkcertPath) {
    generateWithMkcert(mkcertPath);
  } else {
    generateWithOpenssl();
  }
} catch (error) {
  console.error(`Failed to generate certificate using ${mkcertPath ? "mkcert" : "openssl"}.`);
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

console.log("");
console.log(`  cert:  ${CERT_PATH}`);
console.log(`  key:   ${KEY_PATH}`);
console.log(`  hosts: ${hosts.join(", ")}`);
