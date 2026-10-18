import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import https from "node:https";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Store } from "../lib/core.mjs";
import {
  Control,
  remotePath,
  relativePath,
  validateServer,
  validateManifest,
  oracleFreshness,
  locatedOracleManifest,
  oracleManifestIdentity,
} from "../lib/control.mjs";
import { Vault, command, temporaryFiles } from "../lib/secure.mjs";
import { createApplication } from "../server.mjs";

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "impresa-control-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataDir = path.join(root, "data"),
    source = path.join(root, "source");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, ".source"), "");
  fs.writeFileSync(path.join(source, "photo.txt"), "Original photo bytes\n");
  const store = new Store(dataDir),
    control = new Control({
      store,
      dataDir,
      sources: [
        {
          id: "photos",
          name: "Photos",
          path: source,
          requiredPaths: [".source"],
        },
      ],
      restoreRoot: path.join(root, "restore"),
      env: { MIN_FREE_GB: "0" },
      ...options,
    });
  return { root, source, store, control };
}
async function wait(run) {
  for (let i = 0; i < 1500 && ["queued", "running"].includes(run.status); i++)
    await delay(20);
  assert(!["queued", "running"].includes(run.status), "Run timed out");
  return run;
}
async function success(control, body) {
  const r = await wait(control.enqueue(body));
  assert.equal(r.status, "success", r.error);
  return r;
}
const hostKey = "ssh-ed25519 " + Buffer.alloc(32, 1).toString("base64");
const serverBody = {
  id: "oracle",
  name: "Oracle test",
  host: "127.0.0.1",
  port: 2222,
  user: "root",
  root: "/backups/impresa-native",
  hostKey,
  hostKeyVerified: true,
  privateKey:
    "-----BEGIN OPENSSH PRIVATE KEY-----\nTEST-ONLY\n-----END OPENSSH PRIVATE KEY-----\n",
};
test("weekly verification is independent and scheduled only once per date", async (t) => {
  const { control } = fixture(t);
  control.saveServer(serverBody);
  control.saveTask({
    id: "remote",
    name: "Remote",
    serverId: "oracle",
    verifyEnabled: true,
    verifyDay: new Date().getUTCDay(),
    verifyTime: "00:00",
  });
  control.pull = async () => ({ checksumVerified: true });
  const now = new Date();
  control.tick(now, "UTC");
  assert.equal(control.state.runs.length, 1);
  assert.equal(control.state.runs[0].mode, "verify-pull");
  await wait(control.state.runs[0]);
  control.tick(now, "UTC");
  assert.equal(control.state.runs.length, 1);
});
test("automatic Restic waits for a successful producer download today", async (t) => {
  const { control } = fixture(t);
  control.saveServer(serverBody);
  control.saveTask({
    id: "remote",
    name: "Remote",
    serverId: "oracle",
    enabled: true,
    time: "00:00",
  });
  control.saveRepository({
    id: "repo",
    name: "Repo",
    password: "password",
    managed: true,
  });
  control.saveTask({
    id: "history",
    name: "History",
    type: "restic",
    sourceId: "remote:remote",
    repositoryId: "repo",
    enabled: true,
    time: "00:00",
  });
  control.pull = async () => ({ checksumVerified: true });
  control.restic = async () => ({ ok: true });
  const now = new Date();
  control.tick(now, "UTC");
  assert.equal(control.state.runs.length, 1);
  assert.equal(control.state.runs[0].taskId, "remote");
  await wait(control.state.runs[0]);
  control.tick(now, "UTC");
  assert.equal(control.state.runs[0].taskId, "history");
  await wait(control.state.runs[0]);
});

test("SSH and manifest input rejects command injection and traversal", () => {
  for (const v of [
    "/tmp/a;id",
    "/tmp/a b",
    "/tmp/../etc",
    "relative",
    "/tmp/$(id)",
  ])
    assert.throws(() => remotePath(v));
  for (const v of [
    "../secret",
    "/etc/passwd",
    "a/../../b",
    "a\n--config",
    "a\\b",
    "a//b",
  ])
    assert.throws(() => relativePath(v));
  for (const change of [
    { host: "-oProxyCommand=id" },
    { user: "root;id" },
    { port: 70000 },
    { hostKeyVerified: false },
    { hostKey: "PRIVATE KEY" },
  ])
    assert.throws(() => validateServer({ ...serverBody, ...change }));
  const m = {
    status: "ok",
    path: "/backups/impresa-native/sites-daily/2026-10-18_01-00-00",
    files: [{ name: "site.tar.gz", bytes: 1, sha256: "a".repeat(64) }],
  };
  assert.equal(
    validateManifest(m, "/backups/impresa-native").relative,
    "sites-daily/2026-10-18_01-00-00",
  );
  assert.throws(() =>
    validateManifest({ ...m, path: "/etc" }, "/backups/impresa-native"),
  );
  assert.throws(() =>
    validateManifest(
      { ...m, files: [{ name: "../oops", bytes: 1, sha256: "a".repeat(64) }] },
      "/backups/impresa-native",
    ),
  );
  assert.throws(() =>
    validateManifest({ ...m, status: "running" }, "/backups/impresa-native"),
  );
});
test("vault encrypts secrets, preserves them across restart and fails closed without its key", (t) => {
  const { root, control } = fixture(t);
  control.vault.set("password", "very-private-password");
  const saved = fs.readFileSync(control.vault.file, "utf8");
  assert(!saved.includes("very-private-password"));
  assert.equal(
    new Vault(control.dataDir).get("password"),
    "very-private-password",
  );
  fs.unlinkSync(path.join(control.dataDir, "secrets/master.key"));
  assert.throws(() => new Vault(control.dataDir), /missing/);
  assert.equal(fs.statSync(root).mode & 0o077, 0);
});
test("an existing schema-1 USB configuration survives upgrade unchanged", (t) => {
  const { store, control } = fixture(t);
  const job = {
    id: "immich",
    name: "Existing",
    sourceId: "photos",
    enabled: true,
  };
  store.state.jobs.push(job);
  store.save();
  assert.deepEqual(new Store(control.dataDir).state.jobs, [job]);
  assert.equal(store.state.schema, 1);
  assert(!JSON.stringify(control.publicState()).includes("master.key"));
});
test("external storage requires its identity marker and never creates a fallback directory", (t) => {
  const { root, store } = fixture(t);
  const missing = path.join(root, "unmounted");
  const c = new Control({
    store,
    dataDir: store.file.slice(0, -11),
    sources: [],
    restoreRoot: path.join(root, "restore2"),
    env: { STAGING_ROOT: missing, MIN_FREE_GB: "0" },
  });
  assert.equal(c.publicState().storage[0].online, false);
  assert(!fs.existsSync(missing));
  fs.mkdirSync(missing);
  assert.throws(() => c.storageCheck("staging"));
  fs.writeFileSync(
    path.join(missing, ".backup-impresa-staging"),
    "backup-staging-v1\n",
  );
  assert.equal(c.storageCheck("staging").path, missing);
});
test("configuration never exposes stored passwords and existing repositories start read-only", (t) => {
  const { control } = fixture(t);
  control.saveServer(serverBody);
  control.saveRepository({
    id: "repo",
    name: "Imported",
    password: "test-password",
  });
  assert.throws(() =>
    control.enqueue({ repositoryId: "repo", mode: "init", confirm: "repo" }),
  );
  assert(!JSON.stringify(control.publicState()).includes("test-password"));
});
test("configuration changes and duplicate tasks are blocked while an operation runs", async (t) => {
  const { control } = fixture(t, {
    runner: async () => {
      await delay(80);
      return { stdout: "", stderr: "" };
    },
  });
  control.saveServer(serverBody);
  control.saveTask({ id: "remote", name: "Remote", serverId: "oracle" });
  const run = control.enqueue({ taskId: "remote", mode: "pull" });
  assert.throws(() => control.saveServer(serverBody), /Wait/);
  assert.throws(
    () => control.enqueue({ taskId: "remote", mode: "pull" }),
    /active/,
  );
  await wait(run);
});
test("partial Restic exit code is failure, not a successful backup", async (t) => {
  const { control } = fixture(t, {
    runner: async () => {
      const e = Error("restic: exit 3");
      e.exitCode = 3;
      throw e;
    },
  });
  control.saveRepository({
    id: "repo",
    name: "New",
    password: "password",
    managed: true,
  });
  fs.mkdirSync(path.join(control.repositories, "repo"));
  control.saveTask({
    id: "photos",
    name: "Photos",
    type: "restic",
    repositoryId: "repo",
    sourceId: "photos",
  });
  const run = await wait(control.enqueue({ taskId: "photos", mode: "backup" }));
  assert.equal(run.status, "failed");
  assert.match(run.error, /exit 3/);
});
test("webhooks persist failures, retry with same event ID, and never follow a changed destination", async (t) => {
  const { control } = fixture(t);
  const original = globalThis.fetch;
  t.after(() => (globalThis.fetch = original));
  let good = false,
    calls = 0;
  globalThis.fetch = async (url, opts) => {
    calls++;
    assert.equal(opts.redirect, "error");
    assert.equal(opts.headers["X-Backup-Event-Id"], "event-1");
    return { ok: good };
  };
  control.settings({
    RESULT_WEBHOOK_URL: "https://example.test/hook",
    RESULT_WEBHOOK_TOKEN: "private-token",
  });
  const payload = { eventId: "event-1", status: "failed" };
  await assert.rejects(
    control.webhook({
      url: "https://example.test/hook",
      token: "private-token",
      payload,
    }),
  );
  assert.equal(control.state.deliveries[0].status, "pending");
  assert(!JSON.stringify(control.publicState()).includes("private-token"));
  good = true;
  control.state.deliveries[0].nextAttempt = Date.now() - 1;
  await control.retryWebhooks();
  assert.equal(control.state.deliveries[0].status, "sent");
  assert.equal(calls, 2);
  await control.webhook({ url: "https://example.test/hook", payload });
  assert.equal(calls, 2);
});
test("timeout and output bounds terminate child commands", async () => {
  await assert.rejects(
    command(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      timeout: 80,
    }),
    /timed out/,
  );
  await assert.rejects(
    command(
      process.execPath,
      ["-e", 'process.stdout.write("x".repeat(10000))'],
      { maxBytes: 100 },
    ),
    /limit/,
  );
});
test("real HTTPS webhook validates TLS, authenticates requests and preserves a stable event ID", async (t) => {
  const { root } = fixture(t),
    key = path.join(root, "tls.key"),
    cert = path.join(root, "tls.crt");
  await command("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-keyout",
    key,
    "-out",
    cert,
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
  ]);
  const received = [];
  const server = https.createServer(
    { key: fs.readFileSync(key), cert: fs.readFileSync(cert) },
    (req, res) => {
      let body = "";
      req.on("data", (b) => (body += b));
      req.on("end", () => {
        received.push({
          authorization: req.headers.authorization,
          id: req.headers["x-backup-event-id"],
          payload: JSON.parse(body),
        });
        res.end("OK");
      });
    },
  );
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const data = path.join(root, "tls-client");
  fs.mkdirSync(data);
  const script = `import {Control} from './lib/control.mjs';import {Store} from './lib/core.mjs';const c=new Control({store:new Store(${JSON.stringify(data)}),dataDir:${JSON.stringify(data)},sources:[],restoreRoot:${JSON.stringify(path.join(root, "tls-restore"))},env:{MIN_FREE_GB:'0'}});await c.webhook({url:'https://127.0.0.1:${server.address().port}/hook',token:'test-bearer',payload:{eventId:'tls-event-1',status:'success'}});`;
  await assert.rejects(
    command(process.execPath, ["--input-type=module", "-e", script]),
    /exit 1/,
  );
  await command(process.execPath, ["--input-type=module", "-e", script], {
    env: { NODE_EXTRA_CA_CERTS: cert },
  });
  assert.equal(received.length, 1);
  assert.equal(received[0].authorization, "Bearer test-bearer");
  assert.equal(received[0].id, "tls-event-1");
  assert.equal(received[0].payload.eventId, "tls-event-1");
});
test("real Restic: initialize, back up, list, verify, restore and retain old versions", async (t) => {
  const { control, source } = fixture(t);
  control.saveRepository({
    id: "photos",
    name: "Test",
    password: "restic-test-password-12345",
    managed: true,
  });
  await success(control, {
    repositoryId: "photos",
    mode: "init",
    confirm: "photos",
  });
  control.saveTask({
    id: "photos",
    name: "Photos",
    type: "restic",
    repositoryId: "photos",
    sourceId: "photos",
  });
  await success(control, { taskId: "photos", mode: "backup" });
  fs.writeFileSync(path.join(source, "photo.txt"), "Second version\n");
  await success(control, { taskId: "photos", mode: "backup" });
  const list = await success(control, {
    repositoryId: "photos",
    mode: "snapshots",
  });
  assert.equal(list.result.snapshots.length, 2);
  await success(control, { repositoryId: "photos", mode: "check" });
  const snapshot = list.result.snapshots[0],
    restore = await success(control, {
      repositoryId: "photos",
      mode: "restore",
      snapshot: snapshot.id,
    });
  const restored = path.join(restore.restorePath, source, "photo.txt");
  assert.equal(fs.readFileSync(restored, "utf8"), "Original photo bytes\n");
  assert.equal(
    fs.readFileSync(path.join(source, "photo.txt"), "utf8"),
    "Second version\n",
  );
  assert.throws(() =>
    control.enqueue({
      repositoryId: "photos",
      mode: "retention-apply",
      confirm: "photos",
      planToken: "forged",
    }),
  );
  const preview = await success(control, {
    repositoryId: "photos",
    mode: "retention-preview",
  });
  assert(Array.isArray(preview.result.preview));
  const before = fs.readFileSync(path.join(source, "photo.txt"), "utf8");
  if (preview.result.removeCount) {
    await success(control, {
      repositoryId: "photos",
      mode: "retention-apply",
      confirm: "photos",
      planToken: preview.result.planToken,
    });
    assert.equal(
      fs.readFileSync(path.join(source, "photo.txt"), "utf8"),
      before,
    );
  }
  control.state.repositories[0].managed = false;
  await success(control, { repositoryId: "photos", mode: "snapshots" });
  assert.equal(
    (await wait(control.enqueue({ taskId: "photos", mode: "backup" }))).status,
    "failed",
  );
  assert.throws(() =>
    control.enqueue({
      repositoryId: "photos",
      mode: "init",
      confirm: "photos",
    }),
  );
});
test("HTTP API: CSRF, secret redaction, scoped n8n actions and idempotency", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "impresa-api-control-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = createApplication({
    quiet: true,
    sources: [],
    env: {
      DATA_DIR: root,
      RESTORE_ROOT: path.join(root, "restore"),
      SETUP_TOKEN: "test-setup-token-long-enough",
    },
    commandRunner: async () => ({ stdout: "", stderr: "" }),
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const call = (p, body, headers = {}) =>
    fetch(origin + p, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
  await call("/api/setup", {
    token: "test-setup-token-long-enough",
    username: "admin",
    password: "a-long-test-password",
  });
  const login = await call("/api/login", {
      username: "admin",
      password: "a-long-test-password",
    }),
    cookie = login.headers.get("set-cookie").split(";")[0],
    { csrf } = await login.json(),
    headers = { Cookie: cookie, "X-CSRF-Token": csrf };
  assert.equal(
    (await call("/api/control/server", serverBody, { Cookie: cookie })).status,
    403,
  );
  assert.equal(
    (await call("/api/control/server", serverBody, headers)).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/control/task",
        { id: "oracle", name: "Oracle", serverId: "oracle" },
        headers,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/api/control/settings",
        { INBOUND_TASK_IDS: "oracle", SMTP_PASSWORD: "secret-password" },
        headers,
      )
    ).status,
    200,
  );
  const status = await (await call("/api/status", null, headers)).json();
  assert(!JSON.stringify(status).includes("secret-password"));
  assert(!JSON.stringify(status).includes("TEST-ONLY"));
  const token = app.control.apiToken(true),
    auth = {
      Authorization: "Bearer " + token,
      "Idempotency-Key": "test-event-123",
    };
  assert.equal((await call("/api/integrations/status")).status, 401);
  const first = await call(
    "/api/integrations/run",
    { taskId: "oracle", mode: "pull" },
    auth,
  );
  assert.equal(first.status, 202);
  const a = await first.json();
  const second = await call(
    "/api/integrations/run",
    { taskId: "oracle", mode: "pull" },
    auth,
  );
  assert.equal(second.status, 202);
  const b = await second.json();
  assert.equal(a.runId, b.runId);
  assert.equal(b.duplicate, true);
  assert.equal(
    (
      await call(
        "/api/integrations/run",
        { taskId: "oracle", mode: "restore" },
        auth,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        "/api/integrations/run",
        { taskId: "not-allowed", mode: "pull" },
        { ...auth, "Idempotency-Key": "test-event-456" },
      )
    ).status,
    400,
  );
  app.control.apiToken(true);
  assert.equal(
    (await call("/api/integrations/status", null, auth)).status,
    401,
  );
  await wait(app.control.state.runs[0]);
});
test("real SSH: pinned identity, Oracle manifest transfer, corruption detection and SFTP Restic", async (t) => {
  if (!fs.existsSync("/usr/sbin/sshd"))
    return t.skip("Disposable SSH test image required.");
  const { root, control } = fixture(t),
    host = path.join(root, "host"),
    remote = path.join(root, "remote");
  fs.mkdirSync(remote);
  await command("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", host]);
  const hostKey = fs
    .readFileSync(host + ".pub", "utf8")
    .split(" ")
    .slice(0, 2)
    .join(" ");
  const { publicKey } = await control.generateKey("oracle");
  const authroot = fs.mkdtempSync("/root/impresa-sshd-test-");
  t.after(() => fs.rmSync(authroot, { recursive: true, force: true }));
  const authfile = path.join(authroot, "authorized_keys");
  fs.writeFileSync(authfile, publicKey + "\n", { mode: 0o600 });
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const config = path.join(root, "sshd.conf");
  fs.writeFileSync(
    config,
    `Port ${port}\nListenAddress 127.0.0.1\nHostKey ${host}\nPidFile ${root}/sshd.pid\nAuthorizedKeysFile ${authfile}\nStrictModes yes\nPermitRootLogin yes\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nUsePAM no\nAllowUsers root\nSubsystem sftp internal-sftp\n`,
  );
  let diagnostics = "";
  const sshd = spawn("/usr/sbin/sshd", ["-D", "-e", "-f", config]);
  sshd.stderr.on("data", (b) => (diagnostics += b));
  t.after(async () => {
    if (sshd.exitCode === null) {
      const end = new Promise((r) => sshd.once("exit", r));
      sshd.kill();
      await end;
    }
  });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await control.scan({ host: "127.0.0.1", port });
      assert.equal(r.hostKey, hostKey);
      break;
    } catch (e) {
      if (i === 49) throw Error(e.message + " " + diagnostics);
      await delay(50);
    }
  }
  control.saveServer({
    ...serverBody,
    host: "127.0.0.1",
    port,
    hostKey,
    root: remote,
    privateKey: undefined,
  });
  try {
    await control.testServer("oracle");
  } catch (e) {
    throw Error(
      e.message + " " + e.diagnostic + " SSH fixture: " + diagnostics,
    );
  }
  const runFolder = "sites-daily/2026-10-18_01-00-00",
    mFolder = "metadata/" + runFolder;
  fs.mkdirSync(path.join(remote, runFolder), { recursive: true });
  fs.mkdirSync(path.join(remote, mFolder), { recursive: true });
  const content = "A complete website archive fixture\n";
  fs.writeFileSync(path.join(remote, runFolder, "site.tar.gz"), content);
  const manifest = {
    status: "ok",
    completed: new Date().toISOString(),
    path: remote + "/" + runFolder,
    domains: ["example.test"],
    files: [
      {
        name: "site.tar.gz",
        bytes: Buffer.byteLength(content),
        sha256: crypto.createHash("sha256").update(content).digest("hex"),
      },
    ],
  };
  fs.writeFileSync(
    path.join(remote, mFolder, "COMPLETE.json"),
    JSON.stringify(manifest),
  );
  const expired = path.join(remote, "metadata/sites-daily/2026-10-01_01-00-00");
  fs.mkdirSync(expired, { recursive: true });
  fs.writeFileSync(
    path.join(expired, "COMPLETE.json"),
    JSON.stringify({
      ...manifest,
      path: remote + "/sites-daily/2026-10-01_01-00-00",
    }),
  );
  const dailyDocker = "docker-daily/2026-10-18_01-00-00";
  const weeklyDocker = "docker-weekly/2026-10-18_01-00-00";
  fs.mkdirSync(path.join(remote, dailyDocker), { recursive: true });
  fs.writeFileSync(path.join(remote, dailyDocker, "site.tar.gz"), content);
  fs.writeFileSync(
    path.join(remote, dailyDocker, "COMPLETE.json"),
    JSON.stringify({
      ...manifest,
      path: remote + "/" + dailyDocker,
      domains: [],
      containers: ["n8n"],
    }),
  );
  fs.cpSync(path.join(remote, dailyDocker), path.join(remote, weeklyDocker), {
    recursive: true,
  });
  control.saveTask({
    id: "oracle",
    name: "Oracle",
    serverId: "oracle",
    profile: "oracle",
  });
  const copy = await success(control, { taskId: "oracle", mode: "pull" });
  assert.equal(copy.result.checksumVerified, true);
  assert.equal(
    copy.result.backups.length,
    3,
    "Expired metadata must not request a deleted source set",
  );
  assert(copy.result.backups.some((b) => b.domains.includes("example.test")));
  assert(
    fs.existsSync(
      path.join(control.staging, "oracle", weeklyDocker, "site.tar.gz"),
    ),
  );
  await success(control, { taskId: "oracle", mode: "verify-pull" });
  fs.writeFileSync(
    path.join(control.staging, "oracle", runFolder, "site.tar.gz"),
    "damaged",
  );
  assert.equal(
    (await wait(control.enqueue({ taskId: "oracle", mode: "verify-pull" })))
      .status,
    "failed",
  );
  await success(control, { taskId: "oracle", mode: "pull" });
  assert.equal(
    fs.readFileSync(
      path.join(control.staging, "oracle", runFolder, "site.tar.gz"),
      "utf8",
    ),
    content,
  );
  const manifestFile = path.join(remote, mFolder, "COMPLETE.json");
  fs.writeFileSync(
    manifestFile,
    JSON.stringify({
      ...manifest,
      completed: new Date(Date.now() + 60000).toISOString(),
    }),
  );
  fs.utimesSync(manifestFile, new Date(), new Date(Date.now() + 3000));
  const changed = await wait(
    control.enqueue({ taskId: "oracle", mode: "pull" }),
  );
  assert.equal(changed.status, "failed");
  assert.match(changed.error, /manifest changed/);
  assert.equal(
    fs.readFileSync(
      path.join(control.staging, "oracle", runFolder, "site.tar.gz"),
      "utf8",
    ),
    content,
  );
  fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  fs.utimesSync(manifestFile, new Date(), new Date(Date.now() + 6000));
  const wrong = { ...control.state.servers[0], hostKey: serverBody.hostKey };
  await assert.rejects(
    control.pullCommand(wrong, remote, path.join(root, "bad")),
    /rsync/,
  );
  control.saveRepository({
    id: "sftp-test",
    name: "SFTP test",
    type: "sftp",
    serverId: "oracle",
    path: path.join(remote, "restic"),
    password: "sftp-test-password-long",
    managed: true,
  });
  await success(control, {
    repositoryId: "sftp-test",
    mode: "init",
    confirm: "sftp-test",
  });
  control.saveTask({
    id: "remote-history",
    name: "Remote history",
    type: "restic",
    repositoryId: "sftp-test",
    sourceId: "remote:oracle",
  });
  await success(control, { taskId: "remote-history", mode: "backup" });
  const snapshots = await success(control, {
    repositoryId: "sftp-test",
    mode: "snapshots",
  });
  assert.equal(snapshots.result.snapshots.length, 1);
});

test("Oracle freshness uses remote completion dates and requires both selected categories", () => {
  const now = Date.parse("2026-10-18T12:00:00Z"),
    fresh = "2026-10-18T04:30:00Z";
  const sites = { relative: "sites-daily/2026-10-18", completed: fresh };
  const docker = { relative: "docker-daily/2026-10-18", completed: fresh };
  assert.deepEqual(Object.keys(oracleFreshness([sites, docker], {}, now)), [
    "sites",
    "docker",
  ]);
  assert.throws(() => oracleFreshness([sites], {}, now), /category missing/);
  assert.throws(
    () =>
      oracleFreshness(
        [sites, { ...docker, completed: "2026-10-15T04:30:00Z" }],
        {},
        now,
      ),
    /too old: docker/,
  );
  assert.throws(
    () => oracleFreshness([{ ...sites, completed: "bad" }, docker], {}, now),
    /date invalid/,
  );
  assert.throws(
    () =>
      oracleFreshness(
        [{ ...sites, completed: "2026-10-19T00:00:00Z" }, docker],
        {},
        now,
      ),
    /date invalid/,
  );
  assert.equal(
    oracleFreshness([sites], { requireDocker: false }, now).sites.maxAgeHours,
    30,
  );
});
test("Oracle age configuration cannot silently disable all source freshness checks", (t) => {
  const { control } = fixture(t);
  control.saveServer(serverBody);
  const body = {
    id: "oracle",
    name: "Oracle",
    serverId: "oracle",
    profile: "oracle",
  };
  assert.throws(
    () =>
      control.saveTask({ ...body, requireSites: false, requireDocker: false }),
    /at least one/,
  );
  assert.throws(
    () => control.saveTask({ ...body, maxBackupAgeHours: 0 }),
    /1 to 720/,
  );
  const task = control.saveTask(body);
  assert.equal(task.maxBackupAgeHours, 30);
  assert.equal(task.requireSites, true);
  assert.equal(task.requireDocker, true);
});

test("weekly Docker aliases are exact and verified manifests have a stable identity", () => {
  const m = {
    status: "ok",
    path: "/backups/native/docker-daily/2026-10-18",
    completed: "2026-10-18T04:00:00Z",
    files: [{ name: "one", bytes: 1, sha256: "a".repeat(64) }],
  };
  const mapped = locatedOracleManifest(
    m,
    "/backups/native",
    "docker-weekly/2026-10-18",
  );
  assert.equal(mapped.relative, "docker-weekly/2026-10-18");
  assert.equal(mapped.path, "/backups/native/docker-weekly/2026-10-18");
  assert.throws(
    () =>
      locatedOracleManifest(m, "/backups/native", "docker-weekly/2026-10-19"),
    /location/,
  );
  assert.throws(
    () => locatedOracleManifest(m, "/backups/native", "sites-daily/2026-10-18"),
    /location/,
  );
  assert.equal(
    oracleManifestIdentity(mapped),
    oracleManifestIdentity({
      ...mapped,
      files: mapped.files.map((f) => ({
        sha256: f.sha256,
        bytes: f.bytes,
        name: f.name,
      })),
    }),
  );
  assert.notEqual(
    oracleManifestIdentity(mapped),
    oracleManifestIdentity({ ...mapped, completed: "2026-10-19T00:00:00Z" }),
  );
});
