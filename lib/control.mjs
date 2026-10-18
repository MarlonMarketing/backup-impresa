import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Vault, temporaryFiles, command } from "./secure.mjs";
import {
  idPattern,
  safeExisting,
  mkdirSafe,
  within,
  localClock,
} from "./core.mjs";

const fail = (message) => {
  throw Error(message);
};
const id = (v) =>
  idPattern.test(v || "")
    ? v
    : fail("Use a short ID starting with a lowercase letter.");
const text = (v, max = 100) =>
  typeof v === "string" && v.trim() && v.length <= max
    ? v.trim()
    : fail("Required field missing or too long.");
export function remotePath(value) {
  if (
    typeof value !== "string" ||
    !/^\/[a-zA-Z0-9_./-]*$/.test(value) ||
    value.split("/").some((p) => p === ".." || p === ".")
  )
    fail(
      "Remote path: use an absolute path without spaces, shell characters or dot segments.",
    );
  return value.replace(/\/$/, "") || "/";
}
export function relativePath(value) {
  if (
    typeof value !== "string" ||
    !value ||
    path.posix.isAbsolute(value) ||
    value.includes("\\") ||
    /[\x00-\x1f\x7f]/.test(value) ||
    value.split("/").some((p) => !p || p === ".." || p === ".")
  )
    fail("Unsafe relative path.");
  return value;
}
export function validateServer(body, existing) {
  const host = text(body.host, 253),
    user = text(body.user, 40),
    port = Number(body.port || 22);
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host) ||
    !/^[_a-zA-Z][_a-zA-Z0-9-]*$/.test(user) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  )
    fail("Invalid host, SSH user or port.");
  const hostKey = text(body.hostKey, 10000);
  if (
    !/^(ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)|ssh-rsa) [A-Za-z0-9+/=]+$/.test(
      hostKey,
    )
  )
    fail("Paste the server public host key, not a private key.");
  if (hostKey !== existing?.hostKey && body.hostKeyVerified !== true)
    fail("Confirm the host key fingerprint using the server console first.");
  return {
    id: id(existing?.id || body.id),
    name: text(body.name),
    host,
    user,
    port,
    hostKey,
    root: remotePath(body.root),
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
}
export function validateManifest(data, root) {
  if (
    data?.status !== "ok" ||
    !Array.isArray(data.files) ||
    !data.files.length ||
    data.files.length > 100000
  )
    fail("Incomplete or invalid backup manifest.");
  const p = remotePath(data.path),
    prefix = root + "/";
  if (!p.startsWith(prefix))
    fail("Manifest points outside the configured server folder.");
  const relative = relativePath(p.slice(prefix.length));
  if (
    !/^(sites-daily|sites-weekly|docker-daily|docker-weekly)\/[0-9_-]+$/.test(
      relative,
    )
  )
    fail("Unexpected Oracle backup folder.");
  const names = new Set();
  for (const f of data.files) {
    relativePath(f.name);
    if (
      names.has(f.name) ||
      !Number.isSafeInteger(f.bytes) ||
      f.bytes < 0 ||
      !/^([a-f0-9]{64})$/.test(f.sha256)
    )
      fail("Invalid checksum manifest.");
    names.add(f.name);
  }
  return { ...data, relative };
}
export function locatedOracleManifest(data, root, location) {
  const manifest = validateManifest(data, root);
  if (
    location === manifest.relative ||
    location === "metadata/" + manifest.relative
  )
    return manifest;
  // Native Docker weekly sets are independent directory copies. Older producers
  // keep the daily path in their copied manifest; accept only this exact alias.
  if (
    location.startsWith("docker-weekly/") &&
    manifest.relative ===
      "docker-daily/" + location.slice("docker-weekly/".length)
  )
    return {
      ...manifest,
      originalPath: manifest.path,
      path: root + "/" + location,
      relative: location,
    };
  fail("Oracle manifest location does not match its backup folder.");
}
export function oracleManifestIdentity(manifest) {
  return JSON.stringify({
    path: manifest.path,
    completed: manifest.completed,
    files: [...manifest.files]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
  });
}
export function oracleFreshness(manifests, task, now = Date.now()) {
  const maxHours = Number(task.maxBackupAgeHours ?? 30);
  const required = [
    ["sites", task.requireSites !== false],
    ["docker", task.requireDocker !== false],
  ].filter(([, enabled]) => enabled);
  if (
    !required.length ||
    !Number.isInteger(maxHours) ||
    maxHours < 1 ||
    maxHours > 720
  )
    fail(
      "Choose an age limit from 1 to 720 hours and at least one backup category.",
    );
  const result = {};
  for (const [kind] of required) {
    const dates = manifests
      .filter((m) => m.relative.startsWith(kind + "-"))
      .map((m) => Date.parse(m.completed));
    if (
      !dates.length ||
      dates.some((d) => !Number.isFinite(d) || d > now + 300000)
    )
      fail(
        "Oracle backup category missing or completion date invalid: " + kind,
      );
    const latest = Math.max(...dates);
    if (now - latest > maxHours * 3600000)
      fail("Oracle backup too old: " + kind);
    result[kind] = {
      completed: new Date(latest).toISOString(),
      maxAgeHours: maxHours,
    };
  }
  return result;
}
async function digest(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
export class Control {
  constructor({
    store,
    dataDir,
    sources,
    restoreRoot,
    legacyBusy = () => false,
    legacyTasks = () => [],
    legacyRun = () => fail("Local tasks unavailable."),
    notify = async () => {},
    env = process.env,
    runner = command,
  }) {
    Object.assign(this, {
      store,
      dataDir,
      sources,
      restoreRoot,
      legacyBusy,
      legacyTasks,
      legacyRun,
      notify,
      env,
      runner,
    });
    this.vault = new Vault(dataDir, env.MASTER_KEY_FILE || undefined);
    this.staging = path.resolve(
      env.STAGING_ROOT || path.join(dataDir, "remote-copies"),
    );
    this.repositories = path.resolve(
      env.REPOSITORIES_ROOT || path.join(dataDir, "repositories"),
    );
    for (const [p, external] of [
      [this.staging, env.STAGING_ROOT],
      [this.repositories, env.REPOSITORIES_ROOT],
      [restoreRoot, false],
    ])
      if (!external) fs.mkdirSync(p, { recursive: true, mode: 0o700 });
    store.state.control ??= {
      servers: [],
      repositories: [],
      tasks: [],
      runs: [],
      deliveries: [],
      settings: {},
    };
    this.state = store.state.control;
    this.state.deliveries ??= [];
    for (const d of this.state.deliveries)
      if (d.status === "pending" && !d.nextAttempt) d.nextAttempt = Date.now();
    for (const r of this.state.runs)
      if (["queued", "running"].includes(r.status)) {
        r.status = "interrupted";
        r.finishedAt = new Date().toISOString();
      }
    this.queue = [];
    this.active = null;
    this.delivering = false;
    store.save();
  }
  save() {
    this.store.save();
  }
  publicState() {
    return {
      servers: this.state.servers.map((s) => ({
        ...s,
        keyConfigured: this.vault.has("ssh:" + s.id),
      })),
      repositories: this.state.repositories.map((r) => ({
        ...r,
        passwordConfigured: this.vault.has("repo:" + r.id),
      })),
      tasks: this.state.tasks,
      runs: this.state.runs.slice(0, 100),
      deliveries: this.state.deliveries.slice(0, 50),
      active: this.active,
      staging: this.staging,
      repositoryRoot: this.repositories,
      storage: ["staging", "repositories"].map((kind) => {
        try {
          return { kind, online: true, ...this.storageCheck(kind) };
        } catch (e) {
          return { kind, online: false, error: e.message };
        }
      }),
      settings: this.publicSettings(),
    };
  }
  storageCheck(kind) {
    const root = kind === "staging" ? this.staging : this.repositories,
      configured =
        kind === "staging" ? this.env.STAGING_ROOT : this.env.REPOSITORIES_ROOT;
    safeExisting(root);
    if (configured) {
      const expected =
        kind === "staging"
          ? this.env.STAGING_ID || "backup-staging-v1"
          : this.env.REPOSITORIES_ID || "backup-repositories-v1";
      const marker = safeExisting(root, ".backup-impresa-" + kind);
      if (fs.readFileSync(marker, "utf8").trim() !== expected)
        fail(
          "Storage identity missing or incorrect. No fallback folder will be used.",
        );
    }
    const stat = fs.statfsSync(root);
    return {
      path: root,
      free: Number(stat.bavail) * Number(stat.bsize),
      internal: !configured,
    };
  }
  publicSettings() {
    const s = {};
    for (const k of [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_FROM",
      "MAIL_TO",
      "TELEGRAM_CHAT_ID",
      "RESULT_WEBHOOK_URL",
      "NOTIFICATION_LANGUAGE",
      "NOTIFY_SUCCESS",
      "INBOUND_TASK_IDS",
    ])
      s[k] = this.state.settings[k] ?? this.env[k] ?? "";
    for (const k of [
      "SMTP_PASSWORD",
      "TELEGRAM_BOT_TOKEN",
      "RESULT_WEBHOOK_TOKEN",
      "API_TOKEN",
    ])
      s[k + "Configured"] = this.vault.has(k) || Boolean(this.env[k]);
    return s;
  }
  effectiveEnv() {
    const e = { ...this.env, ...this.state.settings };
    for (const k of [
      "SMTP_PASSWORD",
      "TELEGRAM_BOT_TOKEN",
      "RESULT_WEBHOOK_TOKEN",
    ])
      if (this.vault.has(k)) e[k] = this.vault.get(k);
    return e;
  }
  settings(body) {
    const allowed = [
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_FROM",
      "MAIL_TO",
      "TELEGRAM_CHAT_ID",
      "RESULT_WEBHOOK_URL",
      "NOTIFICATION_LANGUAGE",
      "NOTIFY_SUCCESS",
      "INBOUND_TASK_IDS",
    ];
    const next = { ...this.state.settings };
    for (const k of allowed)
      if (Object.hasOwn(body, k)) {
        if (
          typeof body[k] !== "string" ||
          body[k].length > 1000 ||
          /[\r\n\0]/.test(body[k])
        )
          fail("Invalid notification setting.");
        next[k] = body[k];
      }
    if (next.RESULT_WEBHOOK_URL) {
      const u = new URL(next.RESULT_WEBHOOK_URL);
      if (u.protocol !== "https:" || u.username || u.password || u.hash)
        fail("Webhook requires HTTPS without embedded credentials.");
    }
    if (
      next.SMTP_PORT &&
      !["25", "465", "587", "2525"].includes(next.SMTP_PORT)
    )
      fail("Unsupported SMTP port.");
    if (
      next.INBOUND_TASK_IDS &&
      !next.INBOUND_TASK_IDS.split(",").every((v) =>
        [...this.state.tasks, ...this.legacyTasks()].some(
          (t) => t.id === v.trim(),
        ),
      )
    )
      fail("Incoming automation must reference existing task IDs.");
    for (const k of [
      "SMTP_PASSWORD",
      "TELEGRAM_BOT_TOKEN",
      "RESULT_WEBHOOK_TOKEN",
    ])
      if (body[k]) this.vault.set(k, body[k]);
    this.state.settings = next;
    this.save();
    return this.publicSettings();
  }
  apiToken(rotate = false) {
    if (rotate || !this.vault.has("API_TOKEN"))
      this.vault.set("API_TOKEN", crypto.randomBytes(32).toString("hex"));
    return this.vault.get("API_TOKEN");
  }
  validToken(value) {
    const expected = this.vault.has("API_TOKEN")
      ? this.vault.get("API_TOKEN")
      : this.env.API_TOKEN;
    return Boolean(
      expected &&
        typeof value === "string" &&
        crypto.timingSafeEqual(
          crypto.createHash("sha256").update(value).digest(),
          crypto.createHash("sha256").update(expected).digest(),
        ),
    );
  }
  ensureIdle() {
    if (this.active || this.queue.length || this.legacyBusy())
      fail(
        "Wait until all queued operations finish before changing configuration.",
      );
  }
  saveServer(body) {
    this.ensureIdle();
    const old = this.state.servers.find((s) => s.id === body.id),
      s = validateServer(body, old);
    if (!old && this.state.servers.length >= 30) fail("Server limit reached.");
    if (s.root === "/")
      fail("Choose a dedicated backup folder, not the filesystem root.");
    if (
      old &&
      this.state.tasks.some((t) => t.serverId === old.id) &&
      ["host", "user", "port", "root"].some((k) => old[k] !== s[k])
    )
      fail(
        "Create a new server profile to change the source of existing tasks.",
      );
    if (body.privateKey) {
      if (
        !/^-----BEGIN (?:OPENSSH|RSA|EC) PRIVATE KEY-----\r?\n/.test(
          body.privateKey,
        ) ||
        body.privateKey.length > 16384
      )
        fail("Invalid private key. Use a dedicated backup key.");
      this.vault.set("ssh:" + s.id, body.privateKey.trim() + "\n");
    }
    if (!this.vault.has("ssh:" + s.id))
      fail("Generate or paste a dedicated SSH private key first.");
    if (old) this.state.servers[this.state.servers.indexOf(old)] = s;
    else this.state.servers.push(s);
    this.save();
    return s;
  }
  async generateKey(serverId) {
    this.ensureIdle();
    id(serverId);
    if (this.vault.has("ssh:" + serverId))
      fail(
        "Key already exists. Existing keys are never replaced automatically.",
      );
    return this.makeKey(serverId);
  }
  async makeKey(serverId) {
    return temporaryFiles({ seed: "" }, async (f) => {
      const p = f.seed + ".key";
      await this.runner(
        "ssh-keygen",
        [
          "-q",
          "-t",
          "ed25519",
          "-N",
          "",
          "-C",
          "backup-impresa-" + serverId,
          "-f",
          p,
        ],
        { timeout: 15000 },
      );
      const pub = fs.readFileSync(p + ".pub", "utf8").trim();
      this.vault.set("ssh:" + serverId, fs.readFileSync(p, "utf8"));
      return { publicKey: pub };
    });
  }
  async scan(body) {
    const host = text(body.host, 253),
      port = Number(body.port || 22);
    if (
      !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(host) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535
    )
      fail("Invalid SSH address.");
    const r = await this.runner(
      "ssh-keyscan",
      ["-T", "5", "-p", String(port), "-t", "ed25519", host],
      { timeout: 10000 },
    );
    const parts = r.stdout
      .split("\n")
      .find((l) => l && !l.startsWith("#"))
      ?.trim()
      .split(/\s+/);
    if (!parts || parts.length < 3) fail("No SSH host key received.");
    const hostKey = parts.slice(1, 3).join(" "),
      fingerprint =
        "SHA256:" +
        crypto
          .createHash("sha256")
          .update(Buffer.from(parts[2], "base64"))
          .digest("base64")
          .replace(/=+$/, "");
    return {
      hostKey,
      fingerprint,
      warning:
        "Compare this fingerprint using the server console before saving. Scanning alone does not authenticate a server.",
    };
  }
  async ssh(server, action) {
    return temporaryFiles(
      {
        identity: this.vault.get("ssh:" + server.id),
        known_hosts: `[${server.host}]:${server.port} ${server.hostKey}\n${server.host} ${server.hostKey}\n`,
      },
      async (f) => {
        const args = [
          "-F",
          "/dev/null",
          "-i",
          f.identity,
          "-o",
          "IdentitiesOnly=yes",
          "-o",
          "IdentityAgent=none",
          "-o",
          "BatchMode=yes",
          "-o",
          "StrictHostKeyChecking=yes",
          "-o",
          "UserKnownHostsFile=" + f.known_hosts,
          "-o",
          "ConnectTimeout=15",
          "-o",
          "ServerAliveInterval=15",
          "-o",
          "ServerAliveCountMax=3",
          "-o",
          "ClearAllForwardings=yes",
          "-o",
          "PasswordAuthentication=no",
        ];
        return action({
          args,
          port: server.port,
          host: `${server.user}@${server.host}`,
        });
      },
    );
  }
  async pullCommand(server, source, dest, extra = []) {
    return this.ssh(server, (ctx) =>
      this.runner(
        "rsync",
        [
          "--recursive",
          "--times",
          "--no-perms",
          "--no-owner",
          "--no-group",
          "--omit-dir-times",
          "--no-links",
          "--safe-links",
          "--delay-updates",
          "--partial-dir=.impresa-partial",
          ...extra,
          "-e",
          ["ssh", ...ctx.args, "-p", String(ctx.port)].join(" "),
          "--",
          `${ctx.host}:${source}/`,
          dest + "/",
        ],
        { timeout: 24 * 3600000 },
      ),
    );
  }
  async testServer(serverId) {
    this.ensureIdle();
    const s =
      this.state.servers.find((s) => s.id === serverId) ||
      fail("Server not found.");
    await this.pullCommand(s, s.root, path.join(this.staging, ".probe"), [
      "--dry-run",
      "--exclude=*",
    ]);
    return { ok: true };
  }
  saveRepository(body) {
    this.ensureIdle();
    const old = this.state.repositories.find((r) => r.id === body.id),
      r = {
        id: id(old?.id || body.id),
        name: text(body.name),
        type: body.type === "sftp" ? "sftp" : "local",
        managed: body.managed === true,
        keepDaily: Number(body.keepDaily ?? old?.keepDaily ?? 7),
        keepWeekly: Number(body.keepWeekly ?? old?.keepWeekly ?? 4),
        keepMonthly: Number(body.keepMonthly ?? old?.keepMonthly ?? 0),
      };
    if (
      !Number.isInteger(r.keepDaily) ||
      r.keepDaily < 1 ||
      r.keepDaily > 365 ||
      !Number.isInteger(r.keepWeekly) ||
      r.keepWeekly < 0 ||
      r.keepWeekly > 104 ||
      !Number.isInteger(r.keepMonthly) ||
      r.keepMonthly < 0 ||
      r.keepMonthly > 36
    )
      fail("Invalid retention: daily 1–365, weekly 0–104, monthly 0–36.");
    if (old && old.type !== r.type)
      fail("Create a new repository profile to change its type.");
    if (r.type === "sftp") {
      if (!this.state.servers.some((s) => s.id === body.serverId))
        fail("Select a configured SSH server.");
      r.serverId = body.serverId;
      r.path = remotePath(body.path);
      if (old && (old.path !== r.path || old.serverId !== r.serverId))
        fail("Repository location cannot change.");
    } else r.path = path.join(this.repositories, r.id);
    if (body.password)
      this.vault.set("repo:" + r.id, text(body.password, 1000));
    if (!this.vault.has("repo:" + r.id)) fail("Repository password required.");
    if (old) this.state.repositories[this.state.repositories.indexOf(old)] = r;
    else {
      if (this.state.repositories.length >= 30)
        fail("Repository limit reached.");
      this.state.repositories.push(r);
    }
    this.save();
    return r;
  }
  source(task) {
    if (task.sourceId?.startsWith("remote:")) {
      const p = safeExisting(this.staging, task.sourceId.slice(7));
      if (!fs.existsSync(path.join(p, ".backup-impresa-complete")))
        fail("Run and verify the remote download first.");
      return p;
    }
    const s =
      this.sources.find((s) => s.id === task.sourceId) ||
      fail("Select an available source.");
    const p = safeExisting(s.path);
    for (const relative of s.requiredPaths || []) safeExisting(p, relative);
    if (s.dumpDirectory) {
      const dir = safeExisting(p, s.dumpDirectory),
        dates = fs
          .readdirSync(dir)
          .filter((n) => n.endsWith(".sql.gz"))
          .map((n) => fs.statSync(safeExisting(dir, n)).mtimeMs);
      if (
        !dates.length ||
        Date.now() - Math.max(...dates) > (s.maxDumpAgeHours || 26) * 3600000
      )
        fail("Database dump missing or stale.");
    }
    return p;
  }
  saveTask(body) {
    this.ensureIdle();
    const old = this.state.tasks.find((t) => t.id === body.id),
      t = {
        id: id(old?.id || body.id),
        name: text(body.name),
        type: body.type === "restic" ? "restic" : "pull",
        time: body.time || "06:30",
        enabled: body.enabled === true,
        verifyEnabled: body.verifyEnabled === true,
        verifyDay: Number(body.verifyDay ?? 0),
        verifyTime: body.verifyTime || "12:30",
        createdAt: old?.createdAt || new Date().toISOString(),
        lastScheduled: old?.lastScheduled,
        lastScheduledVerify: old?.lastScheduledVerify,
      };
    if (
      !Number.isInteger(t.verifyDay) ||
      t.verifyDay < 0 ||
      t.verifyDay > 6 ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(t.verifyTime)
    )
      fail("Invalid verification schedule.");
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t.time))
      fail("Invalid schedule time.");
    if (old && old.type !== t.type) fail("Task type cannot change.");
    if (t.type === "pull") {
      if (!this.state.servers.some((s) => s.id === body.serverId))
        fail("Select an SSH server.");
      t.serverId = body.serverId;
      t.profile = body.profile === "oracle" ? "oracle" : "files";
      if (t.profile === "oracle") {
        t.maxBackupAgeHours = Number(
          body.maxBackupAgeHours ?? old?.maxBackupAgeHours ?? 30,
        );
        t.requireSites = body.requireSites ?? old?.requireSites ?? true;
        t.requireDocker = body.requireDocker ?? old?.requireDocker ?? true;
        if (
          ![true, false].includes(t.requireSites) ||
          ![true, false].includes(t.requireDocker) ||
          !Number.isInteger(t.maxBackupAgeHours) ||
          t.maxBackupAgeHours < 1 ||
          t.maxBackupAgeHours > 720 ||
          !(t.requireSites || t.requireDocker)
        )
          fail(
            "Choose an age limit from 1 to 720 hours and at least one backup category.",
          );
      }
    } else {
      if (!this.state.repositories.some((r) => r.id === body.repositoryId))
        fail("Select a repository.");
      t.repositoryId = body.repositoryId;
      t.sourceId = text(body.sourceId);
      if (
        !this.sources.some((s) => s.id === t.sourceId) &&
        !this.state.tasks.some(
          (p) => p.type === "pull" && "remote:" + p.id === t.sourceId,
        )
      )
        fail("Select a source.");
    }
    if (
      old &&
      JSON.stringify([
        old.serverId,
        old.sourceId,
        old.repositoryId,
        old.profile,
      ]) !== JSON.stringify([t.serverId, t.sourceId, t.repositoryId, t.profile])
    )
      fail("Create a new task to change its source or repository.");
    if (old) this.state.tasks[this.state.tasks.indexOf(old)] = t;
    else {
      if (this.state.tasks.length >= 60) fail("Task limit reached.");
      this.state.tasks.push(t);
    }
    this.save();
    return t;
  }
  enqueue(body, trigger = "manual") {
    const mode = body.mode,
      allowed = [
        "pull",
        "verify-pull",
        "backup",
        "check",
        "snapshots",
        "restore",
        "init",
        "retention-preview",
        "retention-apply",
      ];
    if (!allowed.includes(mode)) fail("Operation not supported.");
    if (this.active || this.queue.length || this.legacyBusy())
      fail("Another operation is active. Try again after it finishes.");
    let task, repo;
    if (["pull", "verify-pull", "backup"].includes(mode)) {
      task =
        this.state.tasks.find((t) => t.id === body.taskId) ||
        fail("Task not found.");
      if (
        (task.type === "pull" && !["pull", "verify-pull"].includes(mode)) ||
        (task.type === "restic" && mode !== "backup")
      )
        fail("Wrong operation for task type.");
    } else
      repo =
        this.state.repositories.find((r) => r.id === body.repositoryId) ||
        fail("Repository not found.");
    if (mode === "init" && (!repo.managed || body.confirm !== repo.id))
      fail("Type the repository ID to initialize a new managed repository.");
    if (mode === "restore" && !/^[a-f0-9]{64}$/.test(body.snapshot || ""))
      fail("Choose a full snapshot ID from the snapshot list.");
    if (
      mode === "retention-apply" &&
      (!repo.managed ||
        body.confirm !== repo.id ||
        !repo.retentionPlan ||
        repo.retentionPlan.token !== body.planToken ||
        repo.retentionPlan.expires < Date.now())
    )
      fail(
        "Preview retention first, then confirm the repository ID within five minutes.",
      );
    const run = {
      id: crypto.randomUUID(),
      name: task?.name || repo.name,
      taskId: task?.id,
      repositoryId: repo?.id || task?.repositoryId,
      mode,
      trigger,
      status: "queued",
      queuedAt: new Date().toISOString(),
    };
    this.state.runs.unshift(run);
    this.state.runs = this.state.runs.slice(0, 500);
    this.queue.push({
      run,
      task: task && structuredClone(task),
      repo: repo && structuredClone(repo),
      extra: { snapshot: body.snapshot },
    });
    this.save();
    queueMicrotask(() => this.drain());
    return run;
  }
  async drain() {
    if (this.active || !this.queue.length) return;
    const item = this.queue.shift();
    this.active = item.run.id;
    item.run.status = "running";
    item.run.startedAt = new Date().toISOString();
    this.save();
    try {
      if (item.task?.type === "pull")
        item.run.result = await this.pull(
          item.task,
          item.run.mode === "verify-pull",
        );
      else item.run.result = await this.restic(item);
      item.run.status = "success";
    } catch (e) {
      item.run.status = "failed";
      item.run.error = e.message;
    } finally {
      item.run.finishedAt = new Date().toISOString();
      this.active = null;
      this.save();
      try {
        await this.notify(item.run);
      } catch {
        item.run.notificationError =
          "Notification delivery failed; check notification history.";
        this.save();
      }
    }
  }
  free(root) {
    const v = fs.statfsSync(root),
      free = Number(v.bavail) * Number(v.bsize),
      min = Number(this.env.MIN_FREE_GB ?? 10) * 1024 ** 3;
    if (free < min) fail("Free space below safety threshold.");
    return free - min;
  }
  async pull(task, verifyOnly = false) {
    const server =
      this.state.servers.find((s) => s.id === task.serverId) ||
      fail("Server missing.");
    this.storageCheck("staging");
    const root = mkdirSafe(this.staging, task.id);
    this.free(root);
    if (task.profile !== "oracle") {
      const dest = mkdirSafe(root, "files");
      if (!verifyOnly)
        await this.pullCommand(server, server.root, dest, [
          "--backup",
          "--backup-dir=" + mkdirSafe(root, "versions/" + crypto.randomUUID()),
        ]);
      if (verifyOnly) {
        const r = await this.pullCommand(server, server.root, dest, [
          "--checksum",
          "--dry-run",
          "--itemize-changes",
        ]);
        if (r.stdout.trim())
          fail("Remote source differs from the downloaded copy.");
      }
      fs.writeFileSync(
        path.join(root, ".backup-impresa-complete"),
        new Date().toISOString(),
        { mode: 0o600 },
      );
      return { path: root, readable: true, checksumVerified: verifyOnly };
    }
    const catalog = mkdirSafe(root, ".catalog");
    await this.pullCommand(server, server.root, catalog, [
      "--delete",
      "--include=*/",
      "--include=COMPLETE.json",
      "--exclude=*",
    ]);
    const pending = [catalog],
      manifests = [];
    while (pending.length) {
      const dir = pending.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isSymbolicLink()) fail("Catalog contains a symlink.");
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) pending.push(p);
        else if (entry.name === "COMPLETE.json") {
          if (fs.statSync(p).size > 16 * 1024 * 1024)
            fail("Manifest too large.");
          const manifest = locatedOracleManifest(
            JSON.parse(fs.readFileSync(p, "utf8")),
            server.root,
            path.relative(catalog, path.dirname(p)).split(path.sep).join("/"),
          );
          // Virtualmin may retain a metadata manifest after expiring the archive folder.
          // The refreshed directory-only catalog proves which backup folders still exist.
          if (fs.existsSync(path.join(catalog, manifest.relative)))
            manifests.push(manifest);
        }
      }
    }
    if (!manifests.length) fail("No completed Oracle backups found.");
    const freshness = oracleFreshness(manifests, task);
    let count = 0,
      bytes = 0;
    const catalogResult = [];
    for (const m of manifests) {
      const dest = mkdirSafe(root, m.relative),
        names = [];
      const verified = path.join(dest, ".backup-impresa-verified.json");
      if (
        fs.existsSync(verified) &&
        oracleManifestIdentity(
          JSON.parse(
            fs.readFileSync(
              safeExisting(dest, ".backup-impresa-verified.json"),
              "utf8",
            ),
          ).manifest,
        ) !== oracleManifestIdentity(m)
      )
        fail(
          "Previously verified Oracle manifest changed. Existing local archives were preserved.",
        );
      for (const f of m.files) {
        const file = path.join(dest, f.name);
        if (
          fs.existsSync(file) &&
          (await digest(safeExisting(dest, f.name))) === f.sha256
        )
          continue;
        names.push(f.name);
      }
      if (names.length && verifyOnly)
        fail("Some backup files are missing or differ from their manifest.");
      if (names.length) {
        const total = m.files
          .filter((f) => names.includes(f.name))
          .reduce((sum, f) => sum + f.bytes, 0);
        if (total > this.free(root))
          fail("Insufficient space for the remote backup.");
        await temporaryFiles({ files: names.join("\n") + "\n" }, (f) =>
          this.pullCommand(server, server.root + "/" + m.relative, dest, [
            "--files-from=" + f.files,
          ]),
        );
      }
      for (const f of m.files) {
        const p = safeExisting(dest, f.name);
        if (
          !fs.statSync(p).isFile() ||
          fs.statSync(p).size !== f.bytes ||
          (await digest(p)) !== f.sha256
        )
          fail("Downloaded file checksum mismatch.");
        bytes += f.bytes;
        count++;
      }
      fs.writeFileSync(
        path.join(dest, ".backup-impresa-verified.json"),
        JSON.stringify({ completedAt: new Date().toISOString(), manifest: m }),
        { mode: 0o600 },
      );
      catalogResult.push({
        path: m.relative,
        domains: m.domains || [],
        containers: m.containers || [],
        completed: m.completed,
        bytes: m.bytes,
      });
    }
    fs.writeFileSync(
      path.join(root, ".backup-impresa-complete"),
      new Date().toISOString(),
      { mode: 0o600 },
    );
    return {
      path: root,
      checksumVerified: true,
      files: count,
      bytes,
      backups: catalogResult,
      freshness,
    };
  }
  async restic({ run, task, repo, extra }) {
    repo ??=
      this.state.repositories.find((r) => r.id === task.repositoryId) ||
      fail("Repository missing.");
    if (
      ["backup", "init", "retention-apply"].includes(run.mode) &&
      !repo.managed
    )
      fail("Repository is read-only in this panel.");
    return temporaryFiles(
      { password: this.vault.get("repo:" + repo.id) },
      async (f) => {
        const execute = async (connection) => {
          let address = repo.path,
            args = [];
          if (repo.type === "local") {
            this.storageCheck("repositories");
            if (run.mode === "init") {
              mkdirSafe(this.repositories, repo.id);
              if (fs.readdirSync(repo.path).length)
                fail("Initialization requires an empty directory.");
            } else safeExisting(this.repositories, repo.id);
            if (["backup", "init"].includes(run.mode))
              this.free(this.repositories);
          } else {
            address = `sftp:${connection.host}:${repo.path}`;
            args = [
              "-o",
              "sftp.command=" +
                [
                  "ssh",
                  ...connection.args,
                  "-p",
                  String(connection.port),
                  connection.host,
                  "-s",
                  "sftp",
                ].join(" "),
            ];
          }
          const base = [
            "-r",
            address,
            "--password-file",
            f.password,
            "--cache-dir",
            path.join(this.dataDir, "restic-cache"),
            ...args,
          ];
          let operation;
          switch (run.mode) {
            case "init":
              operation = ["init"];
              break;
            case "backup": {
              const source = this.source(task);
              if (
                within(source, this.repositories) ||
                within(source, this.restoreRoot) ||
                within(this.repositories, source)
              )
                fail("Source overlaps repository or restore folder.");
              operation = [
                "backup",
                "--json",
                "--tag",
                "backup-impresa",
                "--tag",
                "backup-impresa:" + task.id,
                "--",
                source,
              ];
              break;
            }
            case "check":
              operation = ["check", "--read-data-subset=10%"];
              break;
            case "snapshots":
              operation = ["snapshots", "--json"];
              break;
            case "restore": {
              this.free(this.restoreRoot);
              const stats = await this.runner("restic", [
                ...base,
                "stats",
                extra.snapshot,
                "--mode",
                "restore-size",
                "--json",
              ]);
              const size = JSON.parse(stats.stdout).total_size;
              if (
                !Number.isSafeInteger(size) ||
                size > this.free(this.restoreRoot)
              )
                fail("Insufficient restore space.");
              const out = mkdirSafe(this.restoreRoot, "restic-" + run.id);
              operation = [
                "restore",
                extra.snapshot,
                "--target",
                out,
                "--verify",
              ];
              run.restorePath = out;
              break;
            }
            case "retention-preview":
              operation = [
                "forget",
                "--dry-run",
                "--json",
                "--tag",
                "backup-impresa",
                "--keep-daily",
                String(repo.keepDaily ?? 7),
                "--keep-weekly",
                String(repo.keepWeekly ?? 4),
                "--keep-monthly",
                String(repo.keepMonthly ?? 0),
              ];
              break;
            case "retention-apply": {
              const ids = repo.retentionPlan?.ids;
              if (!ids?.length || ids.some((v) => !/^[a-f0-9]{64}$/.test(v)))
                fail("No snapshots selected for deletion.");
              operation = ["forget", "--prune", ...ids];
              break;
            }
            default:
              fail("Unsupported Restic operation.");
          }
          const r = await this.runner("restic", [...base, ...operation], {
            timeout: 24 * 3600000,
          });
          if (run.mode === "snapshots")
            return { snapshots: JSON.parse(r.stdout) };
          if (run.mode === "backup") {
            const lines = r.stdout
                .trim()
                .split("\n")
                .filter(Boolean)
                .map((v) => JSON.parse(v)),
              summary = lines.find((v) => v.message_type === "summary");
            if (!summary?.snapshot_id)
              fail("Restic did not return a completed snapshot.");
            return summary;
          }
          if (run.mode === "retention-preview") {
            const preview = JSON.parse(r.stdout),
              ids = preview.flatMap((g) => (g.remove || []).map((s) => s.id));
            const current = this.state.repositories.find(
              (r) => r.id === repo.id,
            );
            current.retentionPlan = {
              token: crypto.randomBytes(24).toString("hex"),
              expires: Date.now() + 5 * 60000,
              ids,
            };
            this.save();
            return {
              preview,
              removeCount: ids.length,
              planToken: current.retentionPlan.token,
              deletionEnabled: repo.managed,
            };
          }
          if (run.mode === "retention-apply") {
            delete this.state.repositories.find((r) => r.id === repo.id)
              .retentionPlan;
            this.save();
            return { removed: repo.retentionPlan.ids.length };
          }
          return {
            ok: true,
            verification:
              run.mode === "check"
                ? "metadata and 10% data sample"
                : run.mode === "restore"
                  ? "restored content verified"
                  : undefined,
          };
        };
        if (repo.type === "sftp") {
          const server =
            this.state.servers.find((s) => s.id === repo.serverId) ||
            fail("SSH server missing.");
          return this.ssh(server, execute);
        }
        return execute();
      },
    );
  }
  tick(now, timezone) {
    const clock = localClock(now, timezone);
    for (const task of this.state.tasks) {
      const producer =
        task.sourceId?.startsWith("remote:") &&
        this.state.tasks.find((t) => t.id === task.sourceId.slice(7));
      if (
        producer?.enabled &&
        !this.state.runs.some(
          (r) =>
            r.taskId === producer.id &&
            r.mode === "pull" &&
            r.status === "success" &&
            localClock(new Date(r.finishedAt), timezone).date === clock.date,
        )
      )
        continue;
      if (
        task.enabled &&
        clock.time >= task.time &&
        task.lastScheduled !== clock.date &&
        !this.active &&
        !this.queue.length &&
        !this.legacyBusy()
      ) {
        this.enqueue(
          { taskId: task.id, mode: task.type === "pull" ? "pull" : "backup" },
          "schedule",
        );
        task.lastScheduled = clock.date;
        this.save();
      }
    }
    for (const task of this.state.tasks) {
      if (
        task.verifyEnabled &&
        clock.weekday === task.verifyDay &&
        clock.time >= task.verifyTime &&
        task.lastScheduledVerify !== clock.date &&
        !this.active &&
        !this.queue.length &&
        !this.legacyBusy()
      ) {
        this.enqueue(
          task.type === "pull"
            ? { taskId: task.id, mode: "verify-pull" }
            : { repositoryId: task.repositoryId, mode: "check" },
          "schedule",
        );
        task.lastScheduledVerify = clock.date;
        this.save();
      }
    }
  }
  async monitor(now) {
    for (const task of this.state.tasks.filter((t) => t.enabled)) {
      const last = this.state.runs.find(
        (r) =>
          r.taskId === task.id &&
          r.status === "success" &&
          ["pull", "backup"].includes(r.mode),
      );
      const date = now.toISOString().slice(0, 10);
      if (
        now - new Date(last?.finishedAt || task.createdAt) > 30 * 3600000 &&
        task.lastStaleAlert !== date
      ) {
        task.lastStaleAlert = date;
        this.save();
        const error = "No successful backup in the last 30 hours: " + task.name;
        this.store.alert(error);
        try {
          await this.notify({
            id: crypto.randomUUID(),
            name: task.name,
            mode: "monitor",
            status: "failed",
            error,
            finishedAt: now.toISOString(),
          });
        } catch {
          this.store.alert("Backup monitor notification delivery failed.");
        }
      }
    }
  }
  async webhook({ url, token, payload }) {
    const eventId =
      payload.eventId ||
      crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    let delivery = this.state.deliveries.find((d) => d.eventId === eventId);
    if (delivery?.status === "sent") return;
    if (!delivery) {
      delivery = {
        eventId,
        payload: { ...payload, eventId },
        status: "pending",
        attempts: 0,
        createdAt: new Date().toISOString(),
        url,
      };
      this.state.deliveries.unshift(delivery);
      this.state.deliveries = this.state.deliveries.slice(0, 500);
    }
    delivery.attempts++;
    this.save();
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" || u.username || u.password)
        fail("Webhook requires HTTPS.");
      const r = await fetch(url, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "X-Backup-Event-Id": eventId,
          ...(token ? { Authorization: "Bearer " + token } : {}),
        },
        body: JSON.stringify(delivery.payload),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) fail("Webhook HTTP " + r.status);
      delivery.status = "sent";
      delivery.sentAt = new Date().toISOString();
      delete delivery.nextAttempt;
      delete delivery.error;
    } catch {
      delivery.status = delivery.attempts >= 4 ? "failed" : "pending";
      delivery.error = "Webhook delivery failed.";
      delivery.nextAttempt =
        Date.now() + Math.min(60, 2 ** delivery.attempts) * 60000;
      throw Error(delivery.error);
    } finally {
      this.save();
    }
  }
  async retryWebhooks() {
    if (this.delivering) return;
    this.delivering = true;
    try {
      const e = this.effectiveEnv();
      for (const d of this.state.deliveries.filter(
        (d) =>
          d.status === "pending" &&
          d.nextAttempt &&
          d.nextAttempt <= Date.now(),
      )) {
        if (d.url !== e.RESULT_WEBHOOK_URL) {
          d.status = "failed";
          d.error = "Webhook destination changed; delivery was not forwarded.";
          this.save();
          continue;
        }
        try {
          await this.webhook({
            url: d.url,
            token: e.RESULT_WEBHOOK_TOKEN,
            payload: d.payload,
          });
        } catch {}
      }
    } finally {
      this.delivering = false;
    }
  }
  incoming(body, key) {
    if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(key || ""))
      fail("Idempotency-Key header required (8–128 characters).");
    if (
      !["pull", "backup", "check", "copy", "verify", "preview"].includes(
        body.mode,
      )
    )
      fail(
        "Automation can only start configured backup and verification operations.",
      );
    const allowed = (this.state.settings.INBOUND_TASK_IDS || "")
      .split(",")
      .map((v) => v.trim());
    if (!allowed.includes(body.taskId))
      fail("Task not allowed for incoming automation.");
    const task =
      [...this.state.tasks, ...this.legacyTasks()].find(
        (t) => t.id === body.taskId,
      ) || fail("Task not found.");
    const signature = JSON.stringify([body.taskId, body.mode]);
    this.state.receipts ??= [];
    const old = this.state.receipts.find((r) => r.key === key);
    if (old) {
      if (old.signature !== signature)
        fail("Idempotency key already used for a different request.");
      return { runId: old.runId, duplicate: true };
    }
    let run;
    if (task.id.startsWith("legacy:")) {
      if (!["copy", "verify", "preview"].includes(body.mode))
        fail("Local tasks allow copy, verify or preview only.");
      if (this.active || this.queue.length)
        fail("Another operation is active.");
      run = this.legacyRun(task.id.slice(7), body.mode);
    } else
      run = this.enqueue(
        body.mode === "check"
          ? { repositoryId: task.repositoryId, mode: "check" }
          : { taskId: task.id, mode: body.mode },
        "n8n",
      );
    this.state.receipts.unshift({ key, signature, runId: run.id });
    this.state.receipts = this.state.receipts.slice(0, 500);
    this.save();
    return { runId: run.id, duplicate: false };
  }
}
