import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { Store, Engine } from "../lib/core.mjs";
import { Vault, command } from "../lib/secure.mjs";
import { Transports, connectorPath, PROVIDERS } from "../lib/transports.mjs";
import { Access } from "../lib/access.mjs";
import { createApplication, passwordHash } from "../server.mjs";

test("upgrade preserves existing jobs, credentials, key bytes and integration settings", (t) => {
  const { root } = fixture(t),
    env = {
      DATA_DIR: path.join(root, "upgrade"),
      RESTORE_ROOT: path.join(root, "restores"),
      SETUP_TOKEN: "upgrade-test-only-token-12345",
    };
  const old = createApplication({ quiet: true, sources: [], env });
  old.store.state.admin = {
    username: "owner",
    password: passwordHash("existing-test-password"),
  };
  old.store.state.jobs = [
    {
      id: "immich",
      name: "Existing",
      enabled: true,
      lastScheduled: { copy: "2026-10-18" },
    },
  ];
  old.control.vault.set("ssh:oracle", "existing-private-key-placeholder");
  old.control.state.settings.INBOUND_TASK_IDS = "legacy:immich";
  delete old.store.state.access;
  delete old.store.state.transports;
  old.store.save();
  const before = structuredClone(old.store.state),
    key = fs.readFileSync(path.join(env.DATA_DIR, "secrets/master.key")),
    secrets = fs.readFileSync(path.join(env.DATA_DIR, "secrets.json"));
  old.close();
  const next = createApplication({ quiet: true, sources: [], env });
  t.after(() => next.close());
  for (const field of ["admin", "jobs", "runs", "control", "alerts"])
    assert.deepEqual(next.store.state[field], before[field], field);
  assert.deepEqual(
    fs.readFileSync(path.join(env.DATA_DIR, "secrets/master.key")),
    key,
  );
  assert.deepEqual(
    fs.readFileSync(path.join(env.DATA_DIR, "secrets.json")),
    secrets,
  );
  assert.equal(
    next.control.vault.get("ssh:oracle"),
    "existing-private-key-placeholder",
  );
});

test("old n8n cannot overlap a connector operation or access a foreign repository through a task ID", (t) => {
  const { root } = fixture(t),
    app = createApplication({
      quiet: true,
      sources: [],
      env: { DATA_DIR: path.join(root, "locks") },
    });
  t.after(() => app.close());
  app.store.state.jobs = [{ id: "demo", name: "Demo" }];
  app.control.state.settings.INBOUND_TASK_IDS = "legacy:demo";
  app.gateway.transports.active = "fixture-active";
  assert.throws(
    () =>
      app.control.incoming(
        { taskId: "legacy:demo", mode: "copy" },
        "request-lock-123",
      ),
    /active/,
  );
  app.gateway.transports.active = null;
  const actor = {
    id: "operator",
    scopes: ["read", "run"],
    resources: ["control:allowed"],
  };
  assert.throws(
    () =>
      app.gateway.legacyPermission(
        actor,
        new URL("http://localhost/api/control/run"),
        "POST",
        { taskId: "allowed", repositoryId: "private", mode: "snapshots" },
      ),
    /scoped plan API/,
  );
  app.gateway.transports.state.plans.push({ id: "existing" });
  assert.throws(
    () =>
      app.gateway.propose(
        { id: "agent", scopes: ["propose"], resources: ["*"] },
        { id: "existing" },
        "proposal-123",
      ),
    /already exists/,
  );
});

function fixture(t, runner) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bi-extended-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const d of ["source", "destination", "restores"])
    fs.mkdirSync(path.join(root, d));
  const store = new Store(path.join(root, "data")),
    vault = new Vault(path.join(root, "data"));
  const tr = new Transports({
    store,
    vault,
    env: {
      DATA_DIR: path.join(root, "data"),
      LOCAL_CONNECTOR_ROOTS: JSON.stringify([root]),
      MIN_FREE_GB: "0",
    },
    restoreRoot: path.join(root, "restores"),
    runner,
  });
  return { root, store, vault, tr };
}
test("reusing a read-only preset source keeps its marker and fresh database requirements", async t => {
  const {tr, root, store} = fixture(t);
  fs.mkdirSync(path.join(root, "source/backups"));
  fs.writeFileSync(path.join(root, "source/existing-marker"), "original");
  const dump = path.join(root, "source/backups/db.sql.gz");
  fs.writeFileSync(dump, "fixture");
  const sources = [{id:"existing", name:"Existing", path:path.join(root,"source"),
    requiredPaths:["existing-marker"], dumpDirectory:"backups", maxDumpAgeHours:26}];
  const engine = new Engine({store, sources, dataDir:path.join(root,"data"),
    targetRoot:path.join(root,"destination"), restoreRoot:path.join(root,"restores")});
  tr.sources = sources;
  tr.sourceCheck = sourceId => engine.sourceCheck({sourceId});
  tr.saveConnection({id:"disk", name:"Disk", type:"local"});
  const input = {id:"preset", name:"Preset", role:"source", connectionId:"disk",
    path:path.join(root,"source"), presetSourceId:"existing"};
  assert.throws(()=>tr.saveLocation({...input, path:path.join(root,"destination")}), /matching/);
  assert.throws(()=>tr.saveLocation({...input, role:"destination"}), /matching/);
  tr.saveLocation(input);
  await tr.initializeLocation("preset", "preset");
  assert(!fs.existsSync(path.join(root,"source/.backup-impresa-location")));
  assert.equal(fs.readFileSync(path.join(root,"source/existing-marker"),"utf8"),"original");
  fs.utimesSync(dump, new Date(0), new Date(0));
  await assert.rejects(tr.initializeLocation("preset","preset"), /Dump database/);
});
async function wait(tr, r) {
  for (let i = 0; i < 3000 && tr.active; i++) await delay(20);
  assert(!tr.active, "Run timed out");
  return r;
}
async function run(tr, b) {
  const r = await wait(tr, tr.enqueue(b));
  assert.equal(r.status, "success", r.error);
  return r;
}
async function localPlan(t, format = "readable") {
  const f = fixture(t);
  f.tr.saveConnection({ id: "disk", name: "Disk", type: "local" });
  for (const [id, role] of [
    ["source", "source"],
    ["destination", "destination"],
  ]) {
    f.tr.saveLocation({
      id,
      name: id,
      role,
      path: path.join(f.root, id),
      connectionId: "disk",
    });
    await f.tr.initializeLocation(id, id);
  }
  f.tr.savePlan({
    id: "photos",
    name: "Photos",
    sourceId: "source",
    destinationId: "destination",
    format,
    archivePassword:
      format === "protected" ? "test-password-only-123" : undefined,
  });
  return f;
}

test("access: invitations, account disabling, token expiry/channel/revoke, no secret disclosure", () => {
  const store = {
      state: { admin: { username: "owner" }, jobs: [] },
      save() {},
    },
    a = new Access(store),
    owner = a.owner();
  const invite = a.invite(owner, {
    name: "Client",
    role: "viewer",
    resources: ["legacy:photos"],
  });
  assert(!JSON.stringify(a.publicState(owner)).includes(invite.token));
  a.accept(
    {
      token: invite.token,
      username: "client",
      password: "long-test-password-123",
    },
    passwordHash,
  );
  assert.throws(() => a.accept({ token: invite.token }, passwordHash));
  let user = a.state.users[0],
    actor = a.principal(user);
  assert(a.allowed(actor, "read", "legacy:photos"));
  assert(!a.allowed(actor, "run", "legacy:photos"));
  assert(!a.allowed(actor, "read", "legacy:private"));
  assert(!JSON.stringify(a.publicState(owner)).includes(user.password));
  a.updateUser(owner, {
    id: user.id,
    role: "viewer",
    resources: [],
    disabled: true,
  });
  assert.equal(a.resolveSession({ userId: user.id }), null);
  const issued = a.issue(owner, {
    name: "Codex",
    scopes: ["read"],
    resources: ["legacy:photos"],
    channel: "mcp",
    days: 1,
  });
  assert.equal(a.authenticate(issued.token, "api"), null);
  assert(a.authenticate(issued.token, "mcp"));
  assert(!JSON.stringify(a.state).includes(issued.token));
  a.revoke(owner, { id: issued.id });
  assert.equal(a.authenticate(issued.token, "mcp"), null);
  assert.throws(() => a.issue(actor, { name: "Forbidden" }), /Owner/);
});

test("connector validation: no traversal, insecure implicit acceptance, unsafe host or overlapping local profiles", (t) => {
  const { tr, root } = fixture(t);
  for (const p of [
    "../etc",
    "folder/../x",
    "x\\y",
    "x\nsecret",
    "x:remote",
    "-argument",
  ])
    assert.throws(() => connectorPath(p));
  assert.equal(connectorPath("photos/Family 2020"), "photos/Family 2020");
  assert.throws(
    () =>
      tr.saveConnection({
        id: "ftp",
        name: "FTP",
        type: "ftp",
        host: "localhost",
        user: "test",
        password: "test",
      }),
    /acknowledgement/,
  );
  assert.throws(() =>
    tr.saveConnection({
      id: "bad",
      name: "Bad",
      type: "sftp",
      host: "-option",
      user: "x",
    }),
  );
  for (const id of ["one", "two"])
    tr.saveConnection({ id, name: id, type: "local" });
  for (const [id, connectionId, role] of [
    ["src", "one", "source"],
    ["dst", "two", "destination"],
  ])
    tr.saveLocation({
      id,
      name: id,
      connectionId,
      role,
      path: path.join(root, "source"),
    });
  assert.throws(
    () =>
      tr.savePlan({
        id: "bad",
        name: "Bad",
        sourceId: "src",
        destinationId: "dst",
      }),
    /overlap/,
  );
  fs.symlinkSync("/etc", path.join(root, "source", "linked"));
  assert.throws(
    () => tr.localPath(path.join(root, "source", "linked")),
    /symlink|symbolic|simbolico|outside/i,
  );
});

test("readable copies: preview, full verification, retained replacements/deletions, offline-source recovery and tamper detection", async (t) => {
  const { tr, root } = await localPlan(t),
    src = path.join(root, "source"),
    dest = path.join(root, "destination");
  fs.writeFileSync(path.join(src, "photo.txt"), "version one");
  await run(tr, { planId: "photos", mode: "preview" });
  assert(!fs.existsSync(path.join(dest, "current/photos/photo.txt")));
  await run(tr, { planId: "photos", mode: "copy" });
  await run(tr, { planId: "photos", mode: "verify" });
  fs.writeFileSync(path.join(src, "photo.txt"), "version two changed");
  const second = await run(tr, { planId: "photos", mode: "copy" });
  assert.equal(
    fs.readFileSync(
      path.join(dest, "versions/photos", second.id, "photo.txt"),
      "utf8",
    ),
    "version one",
  );
  fs.unlinkSync(path.join(src, "photo.txt"));
  await run(tr, { planId: "photos", mode: "copy" });
  assert.equal(
    fs.readFileSync(path.join(dest, "current/photos/photo.txt"), "utf8"),
    "version two changed",
  );
  const files = await tr.browse({ planId: "photos" });
  assert(files.files.some((f) => f.name === "photo.txt"));
  fs.renameSync(src, src + "-offline");
  const restored = await run(tr, {
    planId: "photos",
    mode: "restore",
    version: second.id,
    relative: "photo.txt",
  });
  assert.equal(
    fs.readFileSync(
      path.join(restored.result.restorePath, "photo.txt"),
      "utf8",
    ),
    "version one",
  );
  fs.renameSync(src + "-offline", src);
  fs.writeFileSync(path.join(src, "photo.txt"), "new");
  fs.writeFileSync(path.join(dest, ".backup-impresa-location"), "wrong disk");
  const failed = await wait(tr, tr.enqueue({ planId: "photos", mode: "copy" }));
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /identity/);
  assert.equal(
    fs.readFileSync(path.join(dest, "current/photos/photo.txt"), "utf8"),
    "version two changed",
  );
});

test("protected archive: explicit init, deduplicated snapshots, read-data check, separate restore with source offline", async (t) => {
  const { tr, root, vault } = await localPlan(t, "protected");
  fs.writeFileSync(
    path.join(root, "source", "original.txt"),
    "protected original bytes",
  );
  assert.throws(() =>
    tr.enqueue({ planId: "photos", mode: "init", confirm: "wrong" }),
  );
  await run(tr, { planId: "photos", mode: "init", confirm: "photos" });
  await run(tr, { planId: "photos", mode: "backup" });
  const points = await run(tr, { planId: "photos", mode: "snapshots" });
  assert.equal(points.result.snapshots.length, 1);
  await run(tr, { planId: "photos", mode: "check" });
  fs.renameSync(path.join(root, "source"), path.join(root, "offline"));
  const recovered = await run(tr, {
    planId: "photos",
    mode: "restore",
    snapshot: points.result.snapshots[0].short_id,
  });
  const find = (d) =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .flatMap((e) =>
        e.isDirectory() ? find(path.join(d, e.name)) : [path.join(d, e.name)],
      );
  assert(
    find(recovered.result.restorePath).some(
      (p) =>
        path.basename(p) === "original.txt" &&
        fs.readFileSync(p, "utf8") === "protected original bytes",
    ),
  );
  assert(
    !fs.readFileSync(vault.file, "utf8").includes("test-password-only-123"),
  );
});

test("proposals: resource restrictions, exact digest approval, disabled schedules and replay protection", async (t) => {
  const { tr, store } = await localPlan(t),
    a = new Access(store),
    actor = {
      id: "codex",
      scopes: ["propose"],
      resources: ["location:source", "location:destination"],
    };
  const before = store.state.jobs.slice(),
    p = a.propose(
      actor,
      {
        id: "agent-plan",
        name: "Agent proposal",
        sourceId: "source",
        destinationId: "destination",
        enabled: true,
        verifyEnabled: true,
      },
      (b) => tr.validatePlan(b),
    );
  assert.equal(p.draft.enabled, false);
  assert.throws(
    () =>
      a.approve(
        actor,
        { id: p.id, digest: p.digest, decision: "approve" },
        (b) => tr.savePlan(b),
      ),
    /Owner/,
  );
  assert.throws(() =>
    a.approve(
      a.owner(),
      { id: p.id, digest: "wrong", decision: "approve" },
      (b) => tr.savePlan(b),
    ),
  );
  const approved = a.approve(
    a.owner(),
    { id: p.id, digest: p.digest, decision: "approve" },
    (b) => tr.savePlan(b),
  );
  assert.equal(approved.plan.enabled, false);
  assert.equal(approved.plan.verifyEnabled, false);
  assert.throws(() =>
    a.approve(
      a.owner(),
      { id: p.id, digest: p.digest, decision: "approve" },
      (b) => tr.savePlan(b),
    ),
  );
  assert.deepEqual(store.state.jobs, before);
  let calls = 0;
  const r = a.idempotent(actor, "request-123", { mode: "copy" }, () => ({
    count: ++calls,
  }));
  assert.equal(
    a.idempotent(actor, "request-123", { mode: "copy" }, () => ({
      count: ++calls,
    })).count,
    r.count,
  );
  assert.equal(calls, 1);
  assert.throws(() =>
    a.idempotent(actor, "request-123", { mode: "verify" }, () => ({})),
  );
});

test("HTTP and MCP: unauthenticated denial, client scopes, resource isolation, disabled invite session and owner-only changes", async (t) => {
  const { root } = fixture(t),
    app = createApplication({
      quiet: true,
      sources: [],
      env: {
        DATA_DIR: path.join(root, "http"),
        SETUP_TOKEN: "long-test-token-12345678",
      },
      notifier: { send: async () => {}, channels: () => ({}) },
    });
  t.after(() => app.close());
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + app.server.address().port,
    call = (p, b, headers = {}) =>
      fetch(origin + p, {
        method: b ? "POST" : "GET",
        headers: { "Content-Type": "application/json", ...headers },
        body: b ? JSON.stringify(b) : undefined,
      });
  await call("/api/setup", {
    username: "owner",
    password: "long-test-password-123",
    token: "long-test-token-12345678",
  });
  const owner = app.gateway.access.owner(),
    a = app.gateway.access;
  app.store.state.jobs = [
    { id: "public", name: "Public" },
    { id: "private", name: "Private" },
  ];
  app.store.save();
  const issued = a.issue(owner, {
      name: "Agent",
      channel: "mcp",
      scopes: ["read"],
      resources: ["legacy:public"],
      days: 1,
    }),
    headers = { Authorization: "Bearer " + issued.token };
  assert.equal(
    (await call("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize" }))
      .status,
    401,
  );
  let r = await call(
    "/mcp",
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-11-25" },
    },
    headers,
  );
  assert.equal((await r.json()).result.protocolVersion, "2025-11-25");
  r = await call(
    "/mcp",
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    headers,
  );
  assert.deepEqual(
    (await r.json()).result.tools.map((t) => t.name),
    ["backup_catalog", "backup_status"],
  );
  r = await call(
    "/mcp",
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "backup_catalog" },
    },
    headers,
  );
  const catalog = JSON.parse((await r.json()).result.content[0].text);
  assert.deepEqual(
    catalog.plans.map((p) => p.id),
    ["legacy:public"],
  );
  assert.equal((await call("/api/v1/catalog", null, headers)).status, 401);
  r = await call(
    "/mcp",
    {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "backup_run",
        arguments: { resource: "legacy:public", mode: "copy" },
      },
    },
    headers,
  );
  assert((await r.json()).error);
  assert.equal(
    (
      await call(
        "/mcp",
        { jsonrpc: "2.0", id: 5, method: "ping" },
        { ...headers, Origin: "https://evil.invalid" },
      )
    ).status,
    403,
  );
  const invite = a.invite(owner, {
    name: "Viewer",
    role: "viewer",
    resources: ["legacy:public"],
  });
  await call("/api/access/accept", {
    token: invite.token,
    username: "viewer",
    password: "long-test-password-123",
  });
  r = await call("/api/login", {
    username: "viewer",
    password: "long-test-password-123",
  });
  const cookie = r.headers.get("set-cookie").split(";")[0],
    csrf = (await r.json()).csrf,
    h = { Cookie: cookie, "X-CSRF-Token": csrf };
  r = await call("/api/status", null, h);
  const status = await r.json();
  assert.deepEqual(
    status.jobs.map((j) => j.id),
    ["public"],
  );
  assert.equal(status.access.tokens, undefined);
  assert.equal(
    (await call("/api/access/token", { name: "bad" }, h)).status,
    403,
  );
  assert.equal(
    (await call("/api/run", { jobId: "private", mode: "copy" }, h)).status,
    403,
  );
  assert.equal((await call("/api/files?jobId=public", null, h)).status, 403);
  a.updateUser(owner, {
    id: a.state.users[0].id,
    role: "viewer",
    resources: [],
    disabled: true,
  });
  assert.equal((await call("/api/status", null, h)).status, 401);
  a.revoke(owner, { id: issued.id });
  assert.equal(
    (await call("/mcp", { jsonrpc: "2.0", id: 6, method: "ping" }, headers))
      .status,
    401,
  );
});

test("all protocol profiles keep secrets out of argv/state and persist refreshed cloud tokens", async (t) => {
  const calls = [],
    runner = async (binary, args, options) => {
      calls.push({ binary, args });
      if (args[0] === "obscure") return { stdout: "obscured", stderr: "" };
      return { stdout: "[]", stderr: "" };
    },
    f = fixture(t, runner);
  for (const type of PROVIDERS) {
    const b = {
      id: type,
      name: type,
      type,
      host: "backup.example.test",
      user: "account",
      password: "private-secret",
      allowPlaintext: true,
      hostKey: "ssh-ed25519 " + Buffer.alloc(32, 1).toString("base64"),
      hostKeyVerified: true,
      url: "https://files.example.test/remote.php/dav/files/user/",
      endpoint: "https://s3.example.test",
      accessKey: "private-access",
      secretKey: "private-secret",
      oauthToken: JSON.stringify({
        access_token: "private-token",
        refresh_token: "private-refresh",
      }),
      driveId: "test-drive",
    };
    f.tr.saveConnection(b);
    await f.tr.profiles([type], async (p) => {
      const config = fs.readFileSync(p.config, "utf8");
      assert.match(config, new RegExp("\\[c_" + type + "\\]"));
      assert.equal(fs.statSync(p.config).mode & 0o077, 0);
      if (type === "sftp") assert.match(config, /known_hosts_file/);
      if (type === "ftps") assert.match(config, /explicit_tls = true/);
      if (type === "drive")
        fs.writeFileSync(
          p.config,
          config.replace("private-token", "refreshed-token"),
        );
    });
  }
  assert.equal(
    JSON.parse(f.vault.get("connector:drive")).oauthToken.includes(
      "refreshed-token",
    ),
    true,
  );
  assert(!JSON.stringify(calls).includes("private-secret"));
  assert(!JSON.stringify(f.store.state).includes("private-token"));
});

async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}

for (const copyMode of ["verified", "incremental"])
test("real SMB2: " + copyMode + " authenticated copy, verification, versions and recovery", async (t) => {
  const { tr, root } = await localPlan(t),
    port = await freePort(),
    remote = path.join(root, "smb-share");
  fs.mkdirSync(remote);
  fs.mkdirSync(path.join(remote, "archive"));
  fs.chmodSync(root, 0o755);
  fs.chmodSync(remote, 0o777);
  fs.chmodSync(path.join(remote, "archive"), 0o777);
  const config = path.join(root, "smb.conf");
  for (const d of ["private", "lock", "state", "cache", "pid"])
    fs.mkdirSync(path.join(root, d));
  fs.writeFileSync(
    config,
    `[global]\nserver role = standalone server\nsecurity = user\nsmb ports = ${port}\ninterfaces = 127.0.0.1\nbind interfaces only = yes\npassdb backend = tdbsam:${root}/private/passdb.tdb\nprivate dir = ${root}/private\nlock directory = ${root}/lock\nstate directory = ${root}/state\ncache directory = ${root}/cache\npid directory = ${root}/pid\nlog file = ${root}/smb.log\nload printers = no\ndisable spoolss = yes\n[BACKUPS]\npath = ${remote}\nread only = no\nvalid users = nobody\n`,
  );
  await command("/usr/bin/smbpasswd", ["-s", "-a", "nobody", "-c", config], {
    input: "test-password\ntest-password\n",
  });
  await start(
    t,
    "/usr/sbin/smbd",
    ["-F", "--no-process-group", "--configfile", config],
    port,
  );
  tr.saveConnection({
    id: "smb",
    name: "SMB fixture",
    type: "smb",
    host: "127.0.0.1",
    port,
    user: "nobody",
    password: "test-password",
  });
  tr.saveLocation({
    id: "smb-dest",
    name: "SMB folder",
    role: "destination",
    connectionId: "smb",
    path: "BACKUPS/archive",
  });
  await tr.initializeLocation("smb-dest", "smb-dest");
  tr.savePlan({
    id: "smb-plan",
    name: "SMB plan",
    sourceId: "source",
    destinationId: "smb-dest",
    copyMode,
    maxRunMinutes: 5,
    maxVerifyMinutes: 5,
  });
  fs.writeFileSync(path.join(root, "source", "image.txt"), "SMB original");
  await run(tr, { planId: "smb-plan", mode: "copy" });
  if (copyMode === "incremental") {
    const runner = tr.runner, calls = [];
    tr.runner = async (bin, args, opts) => {
      calls.push(args);
      if (args.includes("lsjson") || args.includes("copy"))
        assert(opts.timeout > 0 && opts.timeout <= 300000);
      return runner(bin, args, opts);
    };
    tr.stageCheck = () => { throw Error("Incremental must not use staging"); };
    const unchanged = await run(tr, { planId: "smb-plan", mode: "copy" });
    assert.equal(unchanged.result.filesTransferred, 0);
    assert.equal(unchanged.result.staging, false);
    assert(!calls.some(args => args.includes("--download")));
    assert(!calls.some(args => args.includes("copy")));
    tr.runner = runner;
  }
  fs.writeFileSync(path.join(root, "source", "image.txt"), "SMB changed!");
  fs.utimesSync(path.join(root, "source", "image.txt"), new Date(), new Date(Date.now() + 3000));
  const second = await run(tr, { planId: "smb-plan", mode: "copy" });
  await run(tr, { planId: "smb-plan", mode: "verify" });
  assert.equal(
    fs.readFileSync(
      path.join(remote, "archive/versions/smb-plan", second.id, "image.txt"),
      "utf8",
    ),
    "SMB original",
  );
  const restored = await run(tr, {
    planId: "smb-plan",
    mode: "restore",
    version: second.id,
    relative: "image.txt",
  });
  assert.equal(
    fs.readFileSync(
      path.join(restored.result.restorePath, "image.txt"),
      "utf8",
    ),
    "SMB original",
  );
  if (copyMode === "incremental") {
    const runner = tr.runner;
    fs.writeFileSync(path.join(root, "source/retry.txt"), "pending verification");
    tr.runner = (bin, args, opts) => {
      if (args.includes("check") && args.includes("--files-from-raw"))
        throw Error("Fixture verification interrupted");
      return runner(bin, args, opts);
    };
    const failed = await wait(tr, tr.enqueue({ planId: "smb-plan", mode: "copy" }));
    assert.equal(failed.status, "failed");
    assert(fs.existsSync(path.join(root, "data/incremental-pending/smb-plan.json")));
    tr.runner = runner;
    const retried = await run(tr, { planId: "smb-plan", mode: "copy" });
    assert.equal(retried.result.filesTransferred, 1);
    assert(!fs.existsSync(path.join(root, "data/incremental-pending/smb-plan.json")));
    fs.unlinkSync(path.join(root, "source/retry.txt"));
    await run(tr, { planId: "smb-plan", mode: "copy" });
    assert(fs.existsSync(path.join(remote, "archive/current/smb-plan/retry.txt")),
      "Source deletion must not delete destination data");
    fs.writeFileSync(path.join(root, "source/space-test.txt"), "new bytes");
    tr.runner = (bin, args, opts) => args.includes("about")
      ? Promise.resolve({stdout: JSON.stringify({free: 0}), stderr: "", code: 0})
      : runner(bin, args, opts);
    const full = await wait(tr, tr.enqueue({ planId: "smb-plan", mode: "copy" }));
    assert.equal(full.status, "failed");
    assert.match(full.error, /space/);
    assert(!fs.existsSync(path.join(remote, "archive/current/smb-plan/space-test.txt")));
    tr.runner = runner;
    fs.unlinkSync(path.join(root, "source/space-test.txt"));
    const target = path.join(remote, "archive/current/smb-plan/image.txt");
    const before = fs.statSync(target);
    fs.writeFileSync(target, "SMB corrupt!");
    fs.utimesSync(target, before.atime, before.mtime);
    const corrupt = await wait(tr, tr.enqueue({ planId: "smb-plan", mode: "verify" }));
    assert.equal(corrupt.status, "failed", "Full check must detect unchanged-file corruption");
    const marker = path.join(remote, "archive/.backup-impresa-location");
    fs.renameSync(marker, marker + ".saved");
    const missing = await wait(tr, tr.enqueue({ planId: "smb-plan", mode: "copy" }));
    assert.equal(missing.status, "failed", "Missing target marker must fail closed");
  }
});
async function start(t, binary, args, port) {
  const child = spawn(binary, args, { stdio: "ignore", detached: true });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const end = new Promise((r) => child.once("exit", r));
      child.kill();
      await end;
    }
  });
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null)
      throw Error("Fixture exited " + child.exitCode);
    try {
      await new Promise((resolve, reject) => {
        const s = net.connect(port, "127.0.0.1", () => {
          s.destroy();
          resolve();
        });
        s.once("error", reject);
      });
      return;
    } catch {}
    await delay(40);
  }
  throw Error("Fixture startup timeout");
}

for (const type of ["ftp", "ftps", "s3"])
  test(
    "real " +
      type +
      ": authenticated remote destination, readable versions and downloaded content checks",
    async (t) => {
      const { tr, root } = await localPlan(t),
        port = await freePort(),
        remote = path.join(root, "remote-" + type),
        key = path.join(root, "tls.key"),
        cert = path.join(root, "tls.crt");
      fs.mkdirSync(remote);
      if (type !== "ftp")
        await command("openssl", [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          key,
          "-out",
          cert,
          "-days",
          "1",
          "-subj",
          "/CN=127.0.0.1",
          "-addext",
          "subjectAltName=IP:127.0.0.1",
        ]);
      const args = [
        "serve",
        type === "s3" ? "s3" : "ftp",
        remote,
        "--addr",
        "127.0.0.1:" + port,
        ...(type === "s3"
          ? ["--auth-key", "test-access,test-secret"]
          : ["--user", "tester", "--pass", "test-password"]),
        ...(type === "ftp" ? [] : ["--cert", cert, "--key", key]),
      ];
      if (type === "ftps") {
        const script = path.join(root, "ftps.py");
        fs.writeFileSync(
          script,
          `from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import TLS_FTPHandler
from pyftpdlib.servers import FTPServer
a=DummyAuthorizer()
a.add_user('tester','test-password',${JSON.stringify(remote)},perm='elradfmwMT')
h=TLS_FTPHandler
h.certfile=${JSON.stringify(cert)}
h.keyfile=${JSON.stringify(key)}
h.authorizer=a
h.tls_control_required=True
h.tls_data_required=True
FTPServer(('127.0.0.1',${port}),h).serve_forever()
`,
        );
        await start(t, "/usr/bin/python3", [script], port);
      } else await start(t, "rclone", args, port);
      fs.mkdirSync(path.join(remote, "archive"));
      tr.saveConnection({
        id: type,
        name: type,
        type,
        tlsMode: "explicit",
        host: "127.0.0.1",
        port,
        user: "tester",
        password: "test-password",
        allowPlaintext: true,
        endpoint: "https://127.0.0.1:" + port,
        accessKey: "test-access",
        secretKey: "test-secret",
        ...(type === "ftp" ? {} : { caCert: fs.readFileSync(cert, "utf8") }),
      });
      tr.saveLocation({
        id: type + "-destination",
        name: "Remote",
        role: "destination",
        connectionId: type,
        path: "archive",
      });
      await tr.initializeLocation(type + "-destination", type + "-destination");
      tr.savePlan({
        id: type + "-plan",
        name: "Remote copy",
        sourceId: "source",
        destinationId: type + "-destination",
      });
      fs.writeFileSync(
        path.join(root, "source", "media.txt"),
        "initial remote bytes",
      );
      await run(tr, { planId: type + "-plan", mode: "copy" });
      fs.writeFileSync(
        path.join(root, "source", "media.txt"),
        "changed remote bytes",
      );
      const second = await run(tr, { planId: type + "-plan", mode: "copy" });
      await run(tr, { planId: type + "-plan", mode: "verify" });
      assert.equal(
        fs.readFileSync(
          path.join(
            remote,
            "archive/versions/" + type + "-plan",
            second.id,
            "media.txt",
          ),
          "utf8",
        ),
        "initial remote bytes",
      );
    },
  );

test("real HTTPS WebDAV: authenticated copy, private CA verification, versions and remote protected archive", async (t) => {
  const { tr, root } = await localPlan(t);
  const port = await freePort(),
    key = path.join(root, "tls.key"),
    cert = path.join(root, "tls.crt"),
    remote = path.join(root, "webdav");
  fs.mkdirSync(remote);
  await command("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    cert,
    "-days",
    "1",
    "-subj",
    "/CN=127.0.0.1",
    "-addext",
    "subjectAltName=IP:127.0.0.1",
  ]);
  await start(
    t,
    "rclone",
    [
      "serve",
      "webdav",
      remote,
      "--addr",
      "127.0.0.1:" + port,
      "--user",
      "tester",
      "--pass",
      "test-password",
      "--cert",
      cert,
      "--key",
      key,
    ],
    port,
  );
  fs.mkdirSync(path.join(remote, "archive"));
  tr.saveConnection({
    id: "dav",
    name: "Private WebDAV",
    type: "webdav",
    url: "https://127.0.0.1:" + port,
    user: "tester",
    password: "test-password",
    caCert: fs.readFileSync(cert, "utf8"),
  });
  tr.saveLocation({
    id: "dav-destination",
    name: "WebDAV",
    role: "destination",
    connectionId: "dav",
    path: "archive",
  });
  await tr.initializeLocation("dav-destination", "dav-destination");
  tr.savePlan({
    id: "web-photos",
    name: "Web photos",
    sourceId: "source",
    destinationId: "dav-destination",
  });
  fs.writeFileSync(path.join(root, "source", "photo.txt"), "WebDAV bytes");
  await run(tr, { planId: "web-photos", mode: "copy" });
  await run(tr, { planId: "web-photos", mode: "verify" });
  assert.equal(
    fs.readFileSync(
      path.join(remote, "archive/current/web-photos/photo.txt"),
      "utf8",
    ),
    "WebDAV bytes",
  );
  tr.savePlan({
    id: "web-protected",
    name: "Remote protected",
    sourceId: "source",
    destinationId: "dav-destination",
    format: "protected",
    archivePassword: "long-test-password-123",
  });
  await run(tr, {
    planId: "web-protected",
    mode: "init",
    confirm: "web-protected",
  });
  await run(tr, { planId: "web-protected", mode: "backup" });
  await run(tr, { planId: "web-protected", mode: "check" });
});

test("real SFTP: pinned host key, download, wrong-key rejection and checksum verification", async (t) => {
  if (!fs.existsSync("/usr/sbin/sshd"))
    return t.skip("Disposable SSH fixture required");
  const { tr, root } = await localPlan(t),
    port = await freePort(),
    host = path.join(root, "host"),
    client = path.join(root, "client");
  for (const f of [host, client])
    await command("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", f]);
  const authorized = path.join(root, "authorized");
  fs.copyFileSync(client + ".pub", authorized);
  const config = path.join(root, "sshd.conf");
  fs.writeFileSync(
    config,
    `Port ${port}\nListenAddress 127.0.0.1\nHostKey ${host}\nAuthorizedKeysFile ${authorized}\nPermitRootLogin yes\nPasswordAuthentication no\nUsePAM no\nStrictModes no\nSubsystem sftp internal-sftp\nPidFile ${root}/sshd.pid\n`,
  );
  await start(t, "/usr/sbin/sshd", ["-D", "-f", config], port);
  const publicKey = fs
    .readFileSync(host + ".pub", "utf8")
    .split(" ")
    .slice(0, 2)
    .join(" ");
  tr.saveConnection({
    id: "ssh",
    name: "SSH fixture",
    type: "sftp",
    host: "127.0.0.1",
    port,
    user: "root",
    hostKey: publicKey,
    hostKeyVerified: true,
    privateKey: fs.readFileSync(client, "utf8"),
  });
  fs.mkdirSync(path.join(root, "remote"));
  fs.writeFileSync(path.join(root, "remote", "video.txt"), "SFTP original");
  tr.saveLocation({
    id: "ssh-source",
    name: "SFTP source",
    role: "source",
    connectionId: "ssh",
    path: path.join(root, "remote"),
  });
  await tr.initializeLocation("ssh-source", "ssh-source");
  tr.savePlan({
    id: "ssh-plan",
    name: "SSH plan",
    sourceId: "ssh-source",
    destinationId: "destination",
  });
  await run(tr, { planId: "ssh-plan", mode: "copy" });
  await run(tr, { planId: "ssh-plan", mode: "verify" });
  assert.equal(
    fs.readFileSync(
      path.join(root, "destination/current/ssh-plan/video.txt"),
      "utf8",
    ),
    "SFTP original",
  );
  tr.state.connections.find((c) => c.id === "ssh").hostKey = fs
    .readFileSync(client + ".pub", "utf8")
    .split(" ")
    .slice(0, 2)
    .join(" ");
  await assert.rejects(tr.testConnection("ssh", path.join(root, "remote")));
});
