import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { command } from "./secure.mjs";
import { idPattern, safeExisting, within, localClock } from "./core.mjs";

export const PROVIDERS = [
  "local",
  "sftp",
  "ftp",
  "ftps",
  "webdav",
  "smb",
  "s3",
  "drive",
  "onedrive",
  "dropbox",
];
const fail = (m) => {
  throw Error(m);
};
const id = (v) => (idPattern.test(v || "") ? v : fail("Invalid identifier."));
const text = (v, max = 200) =>
  typeof v === "string" && v.trim() && v.length <= max
    ? v.trim()
    : fail("Required value missing or too long.");
const line = (v = "") =>
  typeof v === "string" && !/[\r\n\x00]/.test(v) && v.length <= 4096
    ? v
    : fail("Invalid connection value.");
export function connectorPath(v) {
  if (
    typeof v !== "string" ||
    v.length > 1024 ||
    /[\x00-\x1f\x7f\\:]/.test(v) ||
    v.split("/").some((p) => p === ".." || p === ".") ||
    v.startsWith("-")
  )
    fail("Invalid folder path.");
  return v.replace(/\/+$/, "");
}
const posix = (...v) =>
  v
    .map((s) => String(s).replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
const now = () => new Date().toISOString();
function localChild(base, relative) {
  let current = base;
  for (const part of relative.split("/").filter(Boolean)) {
    if (part === ".." || part === "." || part.includes("\\"))
      fail("Unsafe local path.");
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        fail("Symbolic links are not allowed in destination paths.");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return current;
}
export class Transports {
  constructor({
    store,
    vault,
    env = {},
    sources = [],
    restoreRoot,
    runner = command,
    isBusy = () => false,
    notify = async () => {},
  }) {
    Object.assign(this, {
      store,
      vault,
      env,
      sources,
      restoreRoot,
      runner,
      isBusy,
      notify,
    });
    store.state.transports ??= {
      connections: [],
      locations: [],
      plans: [],
      runs: [],
    };
    this.state = store.state.transports;
    this.active = null;
    this.queue = [];
    this.roots = JSON.parse(
      env.LOCAL_CONNECTOR_ROOTS ||
        JSON.stringify([
          "/sources",
          "/destinations",
          "/staging",
          "/repositories",
        ]),
    ).map((p) => path.resolve(p));
    this.stage = path.resolve(
      env.STAGING_ROOT || path.join(env.DATA_DIR || "/data", "remote-copies"),
    );
    if (!env.STAGING_ROOT)
      fs.mkdirSync(this.stage, { recursive: true, mode: 0o700 });
    for (const r of this.state.runs)
      if (["running", "queued"].includes(r.status)) {
        r.status = "interrupted";
        r.finishedAt = now();
        r.error = "Service restarted before completion.";
      }
    store.save();
  }
  async exclusive(action) {
    this.idle();
    this.active = "configuration-check";
    try {
      return await action();
    } finally {
      this.active = null;
    }
  }
  idle() {
    if (this.active || this.queue.length || this.isBusy())
      fail("Another operation is active. Wait for it to finish.");
  }
  saveConnection(b) {
    this.idle();
    const old = this.state.connections.find((c) => c.id === b.id),
      type = b.type;
    if (!PROVIDERS.includes(type)) fail("Unsupported connector.");
    if (old && old.type !== type)
      fail("Create a new connection to change protocol.");
    const c = {
      id: id(b.id),
      name: text(b.name, 100),
      type,
      createdAt: old?.createdAt || now(),
    };
    if (["sftp", "ftp", "ftps", "smb"].includes(type)) {
      c.host = line(text(b.host, 253));
      if (
        !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(c.host) ||
        /^(169\.254\.|metadata\.)/.test(c.host)
      )
        fail("Invalid host.");
      c.user = line(text(b.user, 100));
      c.port = Number(
        b.port || { sftp: 22, ftp: 21, ftps: 21, smb: 445 }[type],
      );
      if (!Number.isInteger(c.port) || c.port < 1 || c.port > 65535)
        fail("Invalid port.");
    }
    if (type === "ftp") {
      if (b.allowPlaintext !== true)
        fail(
          "Plain FTP requires explicit acknowledgement. Prefer FTPS or SFTP.",
        );
      c.allowPlaintext = true;
    }
    if (type === "ftps")
      c.tlsMode = b.tlsMode === "implicit" ? "implicit" : "explicit";
    if (type === "sftp") {
      c.hostKey = line(text(b.hostKey, 10000));
      if (
        !/^(ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)|ssh-rsa) [A-Za-z0-9+/=]+$/.test(
          c.hostKey,
        )
      )
        fail("Invalid SSH host public key.");
      if (c.hostKey !== old?.hostKey && b.hostKeyVerified !== true)
        fail("Compare the SSH fingerprint first.");
    }
    if (type === "webdav") {
      const u = new URL(text(b.url, 2048));
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash
      )
        fail("WebDAV requires HTTPS without embedded credentials.");
      c.url = u.toString();
      c.user = line(b.user || "");
      c.vendor = ["nextcloud", "owncloud", "other"].includes(b.vendor)
        ? b.vendor
        : "other";
    }
    if (type === "s3") {
      c.endpoint = line(b.endpoint || "");
      if (c.endpoint) {
        const u = new URL(c.endpoint);
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          u.search ||
          u.hash
        )
          fail("S3 endpoint must use HTTPS without embedded credentials.");
      }
      c.region = line(b.region || "us-east-1");
    }
    if (type === "smb") c.domain = line(b.domain || "");
    if (type === "drive") c.rootFolderId = line(b.rootFolderId || "");
    if (type === "onedrive") {
      c.driveId = line(text(b.driveId, 500));
      c.driveType = ["personal", "business", "documentLibrary"].includes(
        b.driveType,
      )
        ? b.driveType
        : "personal";
    }
    const previous =
      old && this.vault.has("connector:" + c.id)
        ? JSON.parse(this.vault.get("connector:" + c.id))
        : {};
    const s = { ...previous };
    for (const k of [
      "password",
      "privateKey",
      "keyPassphrase",
      "accessKey",
      "secretKey",
      "oauthToken",
      "clientId",
      "clientSecret",
      "caCert",
    ])
      if (b[k]) {
        if (typeof b[k] !== "string" || b[k].length > 16000)
          fail("Invalid secret.");
        s[k] = b[k];
      }
    if (s.oauthToken) {
      const t = JSON.parse(s.oauthToken);
      if (typeof t.access_token !== "string") fail("Invalid OAuth token JSON.");
    }
    if (s.caCert && !s.caCert.includes("BEGIN CERTIFICATE"))
      fail("Invalid CA certificate PEM.");
    if (["ftp", "ftps", "smb", "webdav"].includes(type) && !s.password)
      fail("Password required.");
    if (type === "sftp" && !s.password && !s.privateKey)
      fail("SSH password or dedicated key required.");
    if (type === "s3" && (!s.accessKey || !s.secretKey))
      fail("S3 credentials required.");
    if (["drive", "onedrive", "dropbox"].includes(type) && !s.oauthToken)
      fail("Authorize the cloud account and paste its OAuth token JSON.");
    if (
      old &&
      JSON.stringify(c) !== JSON.stringify({ ...old, lastTest: undefined }) &&
      this.state.plans.some(
        (p) =>
          p.enabled &&
          this.state.locations.some(
            (l) =>
              l.connectionId === c.id &&
              [p.sourceId, p.destinationId].includes(l.id),
          ),
      )
    )
      fail("Disable dependent schedules before changing the connection.");
    this.vault.set("connector:" + c.id, JSON.stringify(s));
    if (old) {
      c.lastTest = old.lastTest;
      this.state.connections[this.state.connections.indexOf(old)] = c;
    } else {
      if (this.state.connections.length >= 100)
        fail("Connection limit reached.");
      this.state.connections.push(c);
    }
    this.store.save();
    return c;
  }
  localPath(value) {
    const p = path.resolve(value);
    const root = this.roots.find((root) => within(root, p) && p !== root);
    if (!root)
      fail(
        "Local folders must be below an administrator-mounted connector root.",
      );
    return safeExisting(root, path.relative(root, p));
  }
  saveLocation(b) {
    this.idle();
    const old = this.state.locations.find((l) => l.id === b.id),
      c = this.state.connections.find((c) => c.id === b.connectionId);
    if (!c) fail("Connection not found.");
    if (!["source", "destination"].includes(b.role))
      fail("Choose source or destination.");
    const folder =
      c.type === "local"
        ? this.localPath(text(b.path, 1024))
        : connectorPath(text(b.path, 1024));
    if (!folder || folder === "/")
      fail("Select a dedicated subfolder, not the filesystem root.");
    if (
      old &&
      (old.path !== folder || old.connectionId !== c.id || old.role !== b.role)
    )
      fail("Create a new location to change its identity.");
    const l = {
      id: id(b.id),
      name: text(b.name, 100),
      connectionId: c.id,
      role: b.role,
      path: folder,
      marker: old?.marker || "bi-location-" + crypto.randomUUID(),
      createdAt: old?.createdAt || now(),
      initialized: old?.initialized || false,
    };
    if (old) this.state.locations[this.state.locations.indexOf(old)] = l;
    else {
      if (this.state.locations.length >= 200) fail("Location limit reached.");
      this.state.locations.push(l);
    }
    this.store.save();
    return l;
  }
  validatePlan(b) {
    const source = this.state.locations.find(
        (l) => l.id === b.sourceId && l.role === "source",
      ),
      dest = this.state.locations.find(
        (l) => l.id === b.destinationId && l.role === "destination",
      );
    if (!source || !dest)
      fail("Choose configured source and destination locations.");
    const sc = this.state.connections.find((c) => c.id === source.connectionId),
      dc = this.state.connections.find((c) => c.id === dest.connectionId);
    const sameBackend =
      sc.type === dc.type &&
      (sc.type === "local" ||
        JSON.stringify([
          sc.host,
          sc.port,
          sc.user,
          sc.url,
          sc.endpoint,
          sc.driveId,
          sc.rootFolderId,
        ]) ===
          JSON.stringify([
            dc.host,
            dc.port,
            dc.user,
            dc.url,
            dc.endpoint,
            dc.driveId,
            dc.rootFolderId,
          ]));
    if (
      sameBackend &&
      (source.path === dest.path ||
        source.path.startsWith(dest.path + "/") ||
        dest.path.startsWith(source.path + "/"))
    )
      fail("Source and destination overlap.");
    const plan = {
      id: id(b.id),
      name: text(b.name, 100),
      sourceId: source.id,
      destinationId: dest.id,
      format: b.format === "protected" ? "protected" : "readable",
      time: b.time || "18:00",
      enabled: b.enabled === true,
      verifyEnabled: b.verifyEnabled === true,
      verifyDay: Number(b.verifyDay ?? 0),
      verifyTime: b.verifyTime || "12:30",
    };
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.time) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.verifyTime) ||
      !Number.isInteger(plan.verifyDay) ||
      plan.verifyDay < 0 ||
      plan.verifyDay > 6
    )
      fail("Invalid schedule.");
    return plan;
  }
  savePlan(b) {
    this.idle();
    const p = this.validatePlan(b),
      old = this.state.plans.find((v) => v.id === p.id);
    if (
      old &&
      ["sourceId", "destinationId", "format"].some((k) => p[k] !== old[k])
    )
      fail("Create a new plan to change source, destination or format.");
    if (b.archivePassword) {
      if (
        typeof b.archivePassword !== "string" ||
        b.archivePassword.length < 12 ||
        b.archivePassword.length > 500
      )
        fail("Archive password must be at least 12 characters.");
      if (old) fail("Existing archive passwords cannot be changed here.");
      this.vault.set("transport-repo:" + p.id, b.archivePassword);
    }
    if (p.format === "protected" && !this.vault.has("transport-repo:" + p.id))
      fail(
        "Archive password required. Create protected plans from the owner dashboard.",
      );
    Object.assign(p, {
      createdAt: old?.createdAt || now(),
      lastScheduled: old?.lastScheduled,
      lastVerify: old?.lastVerify,
      initialized: old?.initialized || false,
    });
    if (old) this.state.plans[this.state.plans.indexOf(old)] = p;
    else {
      if (this.state.plans.length >= 100) fail("Plan limit reached.");
      this.state.plans.push(p);
    }
    this.store.save();
    return p;
  }
  async profiles(ids, action) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bi-connectors-"));
    fs.chmodSync(dir, 0o700);
    const config = path.join(dir, "rclone.conf"),
      blocks = [],
      certificates = [];
    try {
      for (const cid of [...new Set(ids)]) {
        const c =
            this.state.connections.find((v) => v.id === cid) ||
            fail("Connection missing."),
          s = this.vault.has("connector:" + cid)
            ? JSON.parse(this.vault.get("connector:" + cid))
            : {};
        const r = { type: { ftps: "ftp" }[c.type] || c.type };
        for (const k of ["host", "user", "port", "domain"])
          if (c[k]) r[k] = c[k];
        if (s.password)
          r.pass = (
            await this.runner("rclone", ["obscure", "-"], {
              input: s.password + "\n",
              maxBytes: 65536,
            })
          ).stdout.trim();
        if (c.type === "sftp") {
          r.known_hosts_file = path.join(dir, cid + ".hosts");
          fs.writeFileSync(
            r.known_hosts_file,
            `[${c.host}]:${c.port} ${c.hostKey}\n${c.host} ${c.hostKey}\n`,
            { mode: 0o600 },
          );
          r.disable_hashcheck = "true";
          if (s.privateKey) {
            r.key_file = path.join(dir, cid + ".key");
            fs.writeFileSync(r.key_file, s.privateKey + "\n", { mode: 0o600 });
          }
          if (s.keyPassphrase)
            r.key_file_pass = (
              await this.runner("rclone", ["obscure", "-"], {
                input: s.keyPassphrase + "\n",
              })
            ).stdout.trim();
        }
        if (c.type === "ftps") {
          r.tls = c.tlsMode === "implicit" ? "true" : "false";
          r.explicit_tls = c.tlsMode === "explicit" ? "true" : "false";
        }
        if (c.type === "ftp") {
          r.tls = "false";
          r.explicit_tls = "false";
        }
        if (c.type === "webdav") {
          r.url = c.url;
          r.vendor = c.vendor;
          r.user = c.user;
        }
        if (c.type === "s3") {
          r.provider = "Other";
          r.env_auth = "false";
          r.access_key_id = s.accessKey;
          r.secret_access_key = s.secretKey;
          r.region = c.region;
          if (c.endpoint) r.endpoint = c.endpoint;
          r.force_path_style = "true";
        }
        if (c.type === "drive" && c.rootFolderId)
          r.root_folder_id = c.rootFolderId;
        if (c.type === "onedrive") {
          r.drive_id = c.driveId;
          r.drive_type = c.driveType;
        }
        if (s.oauthToken) r.token = s.oauthToken;
        if (s.clientId) r.client_id = s.clientId;
        if (s.clientSecret) r.client_secret = s.clientSecret;
        if (s.caCert) certificates.push(s.caCert);
        blocks.push(
          `[c_${cid}]\n` +
            Object.entries(r)
              .map(([k, v]) => `${k} = ${line(String(v))}`)
              .join("\n"),
        );
      }
      const env = { RCLONE_CONFIG: config };
      if (certificates.length) {
        env.RCLONE_CA_CERT = path.join(dir, "trusted-ca.pem");
        fs.writeFileSync(
          env.RCLONE_CA_CERT,
          (fs.existsSync("/etc/ssl/certs/ca-certificates.crt")
            ? fs.readFileSync("/etc/ssl/certs/ca-certificates.crt", "utf8") +
              "\n"
            : "") + certificates.join("\n"),
          { mode: 0o600 },
        );
      }
      fs.writeFileSync(config, blocks.join("\n\n"), { mode: 0o600 });
      return await action({
        config,
        dir,
        env,
        ref: (l, rel = "") =>
          this.state.connections.find((c) => c.id === l.connectionId)?.type ===
          "local"
            ? localChild(this.localPath(l.path), rel)
            : `c_${l.connectionId}:${l.path}${rel ? "/" + rel : ""}`,
        run: (args, opts = {}) =>
          this.runner(
            "rclone",
            [
              "--config",
              config,
              "--retries",
              "2",
              "--low-level-retries",
              "3",
              ...args,
            ],
            { env, ...opts },
          ),
      });
    } finally {
      // Rclone can refresh OAuth tokens. Preserve only that field, encrypted, never the temporary config.
      if (fs.existsSync(config)) {
        const contents = fs.readFileSync(config, "utf8");
        for (const cid of [...new Set(ids)]) {
          const c = this.state.connections.find((v) => v.id === cid);
          if (!["drive", "onedrive", "dropbox"].includes(c?.type)) continue;
          const section = contents.split("[c_" + cid + "]")[1]?.split("\n[")[0];
          const token = section?.match(/^token\s*=\s*(.+)$/m)?.[1];
          if (token) {
            try {
              const v = JSON.parse(token);
              if (typeof v.access_token === "string") {
                const saved = JSON.parse(this.vault.get("connector:" + cid));
                if (saved.oauthToken !== token) {
                  saved.oauthToken = token;
                  this.vault.set("connector:" + cid, JSON.stringify(saved));
                }
              }
            } catch {}
          }
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  async testConnection(cid, folder) {
    return this.exclusive(() => this.testConnectionUnlocked(cid, folder));
  }
  async testConnectionUnlocked(cid, folder) {
    const c =
      this.state.connections.find((c) => c.id === cid) ||
      fail("Connection missing.");
    const l = {
      connectionId: cid,
      path:
        c.type === "local"
          ? this.localPath(folder)
          : connectorPath(folder || ""),
    };
    try {
      await this.profiles([cid], (p) =>
        p.run(["lsjson", p.ref(l), "--max-depth", "1", "--dirs-only"], {
          timeout: 30000,
          maxBytes: 1024 * 1024,
        }),
      );
      c.lastTest = { ok: true, at: now() };
      this.store.save();
      return c.lastTest;
    } catch (e) {
      c.lastTest = { ok: false, at: now(), error: e.message };
      this.store.save();
      throw e;
    }
  }
  async identity(l, p, write = false) {
    if (!l) fail("Location missing.");
    const marker = p.ref(l, ".backup-impresa-location");
    if (write) {
      const existing = await p.run(["lsjson", p.ref(l), "--max-depth", "1"], {
        timeout: 30000,
        maxBytes: 1024 * 1024,
      });
      const items = JSON.parse(existing.stdout);
      if (
        l.role === "destination" &&
        items.some((e) => e.Name !== ".backup-impresa-location")
      )
        fail("Initialize only an empty dedicated location.");
      if (items.some((e) => e.Name === ".backup-impresa-location"))
        return this.identity(l, p, false);
      await p.run(["rcat", marker], { input: l.marker + "\n", timeout: 30000 });
    }
    const data = await p.run(["cat", marker], {
      timeout: 30000,
      maxBytes: 4096,
    });
    if (data.stdout.trim() !== l.marker)
      fail("Location identity mismatch. No fallback folder will be used.");
  }
  async initializeLocation(idValue, confirm) {
    return this.exclusive(() =>
      this.initializeLocationUnlocked(idValue, confirm),
    );
  }
  async initializeLocationUnlocked(idValue, confirm) {
    const l =
      this.state.locations.find((l) => l.id === idValue) ||
      fail("Location missing.");
    if (confirm !== l.id)
      fail("Type the location identifier to initialize an empty folder.");
    await this.profiles([l.connectionId], (p) => this.identity(l, p, true));
    l.initialized = true;
    this.store.save();
    return { ok: true };
  }
  stageCheck() {
    safeExisting(this.stage);
    if (this.env.STAGING_ROOT) {
      const marker = path.join(this.stage, ".backup-impresa-staging");
      if (
        fs.readFileSync(marker, "utf8").trim() !==
        (this.env.STAGING_ID || "backup-staging-v1")
      )
        fail("Staging disk identity mismatch.");
    }
    const stat = fs.statfsSync(this.stage);
    return Number(stat.bavail) * Number(stat.bsize);
  }
  enqueue(b, trigger = "manual") {
    this.idle();
    const plan =
      this.state.plans.find((p) => p.id === b.planId) ||
      fail("Plan not found.");
    const allowed =
      plan.format === "readable"
        ? ["copy", "preview", "verify", "restore"]
        : ["init", "backup", "check", "snapshots", "restore"];
    if (!allowed.includes(b.mode))
      fail("Operation not available for this plan.");
    if (b.mode === "init" && b.confirm !== plan.id)
      fail("Explicit initialization confirmation required.");
    const r = {
      id: crypto.randomUUID(),
      planId: plan.id,
      name: plan.name,
      mode: b.mode,
      status: "queued",
      trigger,
      queuedAt: now(),
    };
    this.state.runs.unshift(r);
    this.state.runs = this.state.runs.slice(0, 500);
    this.store.save();
    this.active = r.id;
    r.status = "running";
    r.startedAt = now();
    this.store.save();
    this.execute(plan, b, r)
      .then((result) => {
        r.result = result;
        r.status = "success";
      })
      .catch((e) => {
        r.status = "failed";
        r.error = e.message;
      })
      .finally(async () => {
        r.finishedAt = now();
        this.active = null;
        this.store.save();
        try {
          await this.notify(r);
        } catch (e) {
          r.notificationError = e.message;
          this.store.save();
        }
      });
    return r;
  }
  async execute(plan, b, r) {
    const src = this.state.locations.find((l) => l.id === plan.sourceId),
      dest = this.state.locations.find((l) => l.id === plan.destinationId);
    return this.profiles(
      ["copy", "preview", "verify", "backup"].includes(b.mode)
        ? [src.connectionId, dest.connectionId]
        : [dest.connectionId],
      async (p) => {
        if (["copy", "preview", "verify", "backup"].includes(b.mode))
          await this.identity(src, p);
        await this.identity(dest, p);
        const current = p.ref(dest, "current/" + plan.id),
          versions = p.ref(dest, "versions/" + plan.id + "/" + r.id);
        if (plan.format === "protected")
          return this.protected(plan, b, r, src, dest, p);
        if (b.mode === "restore") {
          const version = b.version || "current";
          if (version !== "current" && !/^[0-9a-f-]{36}$/.test(version))
            fail("Invalid version.");
          const relative = b.relative || "";
          if (
            relative &&
            (connectorPath(relative) !== relative || relative.startsWith("/"))
          )
            fail("Invalid recovery path.");
          const base =
            version === "current"
              ? "current/" + plan.id
              : "versions/" + plan.id + "/" + version;
          const target = path.join(
            safeExisting(this.restoreRoot),
            "connectors-" + r.id,
          );
          fs.mkdirSync(target, { mode: 0o700 });
          const origin = p.ref(dest, posix(base, relative));
          const estimate = JSON.parse(
            (await p.run(["size", origin, "--json"], { timeout: 120000 }))
              .stdout,
          );
          const stat = fs.statfsSync(target);
          if (
            !Number.isFinite(estimate.bytes) ||
            estimate.bytes >
              Number(stat.bavail) * Number(stat.bsize) -
                Number(this.env.MIN_FREE_GB || 0) * 1024 ** 3
          )
            fail("Insufficient restore space.");
          await p.run(["copy", origin, target, "--create-empty-src-dirs"]);
          return { restorePath: target, version, relative };
        }
        if (b.mode === "preview") {
          const out = await p.run(
            [
              "copy",
              p.ref(src),
              current,
              "--dry-run",
              "--backup-dir",
              versions,
              "--exclude",
              ".backup-impresa-*",
              "--create-empty-src-dirs",
            ],
            { maxBytes: 1048576 },
          );
          return { dryRun: true, summary: out.stderr.slice(-12000) };
        }
        if (b.mode === "verify") {
          await p.run(
            [
              "check",
              p.ref(src),
              current,
              "--download",
              "--one-way",
              "--exclude",
              ".backup-impresa-*",
            ],
            { timeout: 24 * 3600000 },
          );
          return {
            verification: "full-content-download",
            sourceFilesOnly: true,
          };
        }
        const inventory = JSON.parse(
          (
            await p.run(
              [
                "lsjson",
                p.ref(src),
                "--recursive",
                "--files-only",
                "--exclude",
                ".backup-impresa-*",
              ],
              { timeout: 120000, maxBytes: 16 * 1024 * 1024 },
            )
          ).stdout,
        );
        if (
          inventory.some(
            (f) =>
              /[\x00-\x1f\x7f\\]/.test(f.Path) ||
              f.Path.split("/").some((v) => v === ".."),
          )
        )
          fail("Unsupported control character or unsafe source filename.");
        const free = this.stageCheck(),
          estimate = JSON.parse(
            (
              await p.run(
                [
                  "size",
                  p.ref(src),
                  "--json",
                  "--exclude",
                  ".backup-impresa-*",
                ],
                { timeout: 120000 },
              )
            ).stdout,
          );
        if (
          !Number.isFinite(estimate.bytes) ||
          estimate.bytes > free - Number(this.env.MIN_FREE_GB || 0) * 1024 ** 3
        )
          fail("Insufficient staging space for a verified source download.");
        const temp = fs.mkdtempSync(path.join(this.stage, "connector-"));
        fs.chmodSync(temp, 0o700);
        try {
          await p.run([
            "copy",
            p.ref(src),
            temp,
            "--exclude",
            ".backup-impresa-*",
            "--create-empty-src-dirs",
          ]);
          await p.run(
            [
              "check",
              p.ref(src),
              temp,
              "--download",
              "--one-way",
              "--exclude",
              ".backup-impresa-*",
            ],
            { timeout: 24 * 3600000 },
          );
          await p.run(["mkdir", current]);
          // Compare actual bytes, including backends with no reliable hash/modification time.
          const different = path.join(p.dir, "different"),
            missing = path.join(p.dir, "missing"),
            errors = path.join(p.dir, "errors");
          let comparisonError;
          try {
            await p.run(
              [
                "check",
                temp,
                current,
                "--download",
                "--one-way",
                "--differ",
                different,
                "--missing-on-dst",
                missing,
                "--error",
                errors,
              ],
              { timeout: 24 * 3600000 },
            );
          } catch (e) {
            comparisonError = e;
          }
          const read = (f) =>
            fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
          const changed = [
            ...new Set(
              (read(different) + read(missing)).split("\n").filter(Boolean),
            ),
          ];
          if (read(errors).trim() || (comparisonError && !changed.length))
            throw (
              comparisonError || Error("Destination content comparison failed.")
            );
          if (changed.some((f) => connectorPath(f) !== f || f.startsWith("/")))
            fail("Unsupported file name in comparison report.");
          if (changed.length) {
            const localDest =
              this.state.connections.find((c) => c.id === dest.connectionId)
                .type === "local";
            if (localDest) {
              const stat = fs.statfsSync(this.localPath(dest.path));
              const needed = changed.reduce(
                (n, f) => n + fs.statSync(localChild(temp, f)).size,
                0,
              );
              if (
                needed >
                Number(stat.bavail) * Number(stat.bsize) -
                  Number(this.env.MIN_FREE_GB || 0) * 1024 ** 3
              )
                fail("Insufficient destination space for retained versions.");
            }
            const files = path.join(p.dir, "changed-files");
            fs.writeFileSync(files, changed.join("\n") + "\n", { mode: 0o600 });
            await p.run([
              "copy",
              temp,
              current,
              "--ignore-times",
              "--files-from-raw",
              files,
              "--backup-dir",
              versions,
              "--create-empty-src-dirs",
            ]);
          }
          await p.run(["check", temp, current, "--download", "--one-way"], {
            timeout: 24 * 3600000,
          });
          return {
            bytes: estimate.bytes,
            verification: "full-content-download",
            versions: "replaced-files-only",
            deletions: false,
          };
        } finally {
          fs.rmSync(temp, { recursive: true, force: true });
        }
      },
    );
  }
  async protected(plan, b, r, src, dest, p) {
    const password = this.vault.get("transport-repo:" + plan.id),
      file = path.join(p.dir, "archive-password");
    fs.writeFileSync(file, password, { mode: 0o600 });
    const local =
      this.state.connections.find((c) => c.id === dest.connectionId).type ===
      "local";
    const repo = local
      ? p.ref(dest, "protected/" + plan.id)
      : `rclone:c_${dest.connectionId}:${dest.path}/protected/${plan.id}`;
    const env = { ...p.env, RESTIC_PASSWORD_FILE: file };
    const run = (args) =>
      this.runner("restic", ["-r", repo, "--json", ...args], {
        env,
        timeout: 24 * 3600000,
        maxBytes: 16 * 1024 * 1024,
      });
    if (b.mode === "init") {
      if (plan.initialized) fail("Archive already initialized.");
      await run(["init"]);
      plan.initialized = true;
      this.store.save();
      return { initialized: true };
    }
    if (!plan.initialized) fail("Initialize the new empty archive first.");
    if (b.mode === "check") {
      await run(["check", "--read-data"]);
      return { verification: "full-archive-data" };
    }
    if (b.mode === "snapshots")
      return { snapshots: JSON.parse((await run(["snapshots"])).stdout) };
    if (b.mode === "restore") {
      if (!/^[a-f0-9]{8,64}$/.test(b.snapshot || ""))
        fail("Choose a valid snapshot identifier.");
      const snapshots = JSON.parse(
        (await run(["snapshots", b.snapshot])).stdout,
      );
      if (snapshots.length !== 1) fail("Snapshot not found.");
      const target = path.join(
        safeExisting(this.restoreRoot),
        "protected-" + r.id,
      );
      const stat = fs.statfsSync(this.restoreRoot),
        stats = JSON.parse(
          (await run(["stats", b.snapshot, "--mode", "restore-size"])).stdout,
        );
      if (
        !Number.isFinite(stats.total_size) ||
        stats.total_size >
          Number(stat.bavail) * Number(stat.bsize) -
            Number(this.env.MIN_FREE_GB || 0) * 1024 ** 3
      )
        fail("Insufficient restore space.");
      fs.mkdirSync(target, { mode: 0o700 });
      await run(["restore", b.snapshot, "--target", target]);
      return { restorePath: target, snapshot: b.snapshot };
    }
    const inventory = JSON.parse(
      (
        await p.run(
          [
            "lsjson",
            p.ref(src),
            "--recursive",
            "--files-only",
            "--exclude",
            ".backup-impresa-*",
          ],
          { timeout: 120000, maxBytes: 16 * 1024 * 1024 },
        )
      ).stdout,
    );
    if (
      inventory.some(
        (f) =>
          /[\x00-\x1f\x7f\\]/.test(f.Path) ||
          f.Path.split("/").some((v) => v === ".."),
      )
    )
      fail("Unsupported control character or unsafe source filename.");
    const free = this.stageCheck(),
      estimate = JSON.parse(
        (
          await p.run(
            ["size", p.ref(src), "--json", "--exclude", ".backup-impresa-*"],
            { timeout: 120000 },
          )
        ).stdout,
      );
    if (
      !Number.isFinite(estimate.bytes) ||
      estimate.bytes > free - Number(this.env.MIN_FREE_GB || 0) * 1024 ** 3
    )
      fail("Insufficient staging space.");
    const temp = fs.mkdtempSync(path.join(this.stage, "protected-"));
    try {
      await p.run(["copy", p.ref(src), temp, "--exclude", ".backup-impresa-*"]);
      await p.run(
        [
          "check",
          p.ref(src),
          temp,
          "--download",
          "--one-way",
          "--exclude",
          ".backup-impresa-*",
        ],
        { timeout: 24 * 3600000 },
      );
      const result = await run([
        "backup",
        temp,
        "--tag",
        "backup-impresa:" + plan.id,
      ]);
      const summary = result.stdout
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .findLast((v) => v.message_type === "summary");
      if (!summary?.snapshot_id)
        fail("Archive did not return a completed snapshot.");
      return { bytes: estimate.bytes, summary };
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  }
  async browse(b) {
    return this.exclusive(() => this.browseUnlocked(b));
  }
  async browseUnlocked(b) {
    const plan =
        this.state.plans.find((p) => p.id === b.planId) ||
        fail("Plan missing."),
      dest = this.state.locations.find((l) => l.id === plan.destinationId);
    if (plan.format !== "readable")
      fail("Use recovery points for protected archives.");
    const rel = b.path || "";
    if (rel && (connectorPath(rel) !== rel || rel.startsWith("/")))
      fail("Invalid browse path.");
    const version = b.version || "current";
    if (version !== "current" && !/^[0-9a-f-]{36}$/.test(version))
      fail("Invalid version.");
    return this.profiles([dest.connectionId], async (p) => {
      await this.identity(dest, p);
      const base =
        version === "current"
          ? "current/" + plan.id
          : "versions/" + plan.id + "/" + version;
      const items = JSON.parse(
        (
          await p.run(
            ["lsjson", p.ref(dest, posix(base, rel)), "--max-depth", "1"],
            { timeout: 30000, maxBytes: 1024 * 1024 },
          )
        ).stdout,
      );
      const versions = this.state.runs
        .filter((r) => r.planId === plan.id && r.mode === "copy")
        .map((r) => r.id);
      return {
        files: items
          .slice(0, 1000)
          .map((f) => ({
            name: f.Name,
            directory: f.IsDir,
            bytes: f.Size,
            modifiedAt: f.ModTime,
          })),
        versions,
      };
    });
  }
  tick(date, timezone) {
    const c = localClock(date, timezone);
    for (const p of this.state.plans) {
      if (this.active || this.isBusy()) return;
      const verify =
        p.verifyEnabled &&
        c.weekday === p.verifyDay &&
        c.time >= p.verifyTime &&
        p.lastVerify !== c.date;
      const copy = p.enabled && c.time >= p.time && p.lastScheduled !== c.date;
      const mode = copy
        ? p.format === "protected"
          ? "backup"
          : "copy"
        : verify
          ? p.format === "protected"
            ? "check"
            : "verify"
          : null;
      if (mode) {
        this.enqueue({ planId: p.id, mode }, "schedule");
        if (copy) p.lastScheduled = c.date;
        else p.lastVerify = c.date;
        this.store.save();
      }
    }
  }
  publicState() {
    return {
      providers: PROVIDERS,
      connections: this.state.connections.map((c) => ({
        ...c,
        credentialsConfigured: this.vault.has("connector:" + c.id),
      })),
      locations: this.state.locations,
      plans: this.state.plans,
      runs: this.state.runs.slice(0, 100),
      active: this.active,
      localRoots: this.roots,
    };
  }
}
