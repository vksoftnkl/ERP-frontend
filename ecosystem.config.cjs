/**
 * PM2 process config for the CloudJiffy (Jelastic) Node.js layer.
 *
 * Point the node at this file with the platform env var
 *   PROCESS_MANAGER_FILE=ecosystem.config.cjs
 * otherwise /usr/local/sbin/nodejs hunts for a server.js/app.js/index.js that
 * this repo does not have, and the systemd unit fails before PM2 ever starts.
 *
 * `npm start` -- NOT the next binary -- is deliberate: it runs
 * scripts/ensure-build.js first, so a `git pull` onto the node actually reaches
 * the browser. Launching `next/dist/bin/next start` directly skips the build
 * gate and serves whatever stale bundle happens to be on disk (and dies outright
 * when .next/BUILD_ID is missing).
 */
module.exports = {
  apps: [
    {
      name: "vknext-front",
      script: "npm",
      args: "start",
      // Resolve from this file so the config works wherever the repo is checked out.
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      interpreter: "none",
      // PORT is overridable so a staging node or a local rehearsal can use another
      // port; the platform only routes 3000, so that stays the default.
      env: { NODE_ENV: "production", PORT: Number(process.env.PORT) || 3000 },
      // `next build` peaks around 1 GB, and it runs inside this process tree via
      // the start script -- a 1 GB ceiling would kill the build mid-flight and
      // loop forever. The platform already grants a 2560 MB heap.
      max_memory_restart: "2G",
      // A build can take minutes; don't let PM2 mistake a slow boot for a crash loop.
      min_uptime: "10s",
      max_restarts: 5,
      autorestart: true,
    },
  ],
};
