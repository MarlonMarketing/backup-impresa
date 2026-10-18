import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { spawn } from "node:child_process";

// The key is deliberately separate from the JSON configuration. For stronger separation
// provide MASTER_KEY_FILE on a separately protected persistent mount.
export class Vault {
  constructor(dataDir, keyFile = path.join(dataDir, "secrets", "master.key")) {
    this.file = path.join(dataDir, "secrets.json");
    if (fs.existsSync(this.file) && !fs.existsSync(keyFile))
      throw Error(
        "Secret key missing. Restore the key; do not create a replacement.",
      );
    fs.mkdirSync(path.dirname(keyFile), { recursive: true, mode: 0o700 });
    if (!fs.existsSync(keyFile))
      fs.writeFileSync(keyFile, crypto.randomBytes(32), {
        mode: 0o600,
        flag: "wx",
      });
    this.key = fs.readFileSync(keyFile);
    if (this.key.length !== 32) throw Error("Invalid secret key");
    this.values = fs.existsSync(this.file)
      ? JSON.parse(fs.readFileSync(this.file, "utf8"))
      : {};
  }
  set(id, value) {
    if (typeof value !== "string" || value.length > 32768)
      throw Error("Invalid secret");
    const iv = crypto.randomBytes(12),
      cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    this.values[id] = {
      iv: iv.toString("base64"),
      tag: null,
      value: Buffer.concat([
        cipher.update(value, "utf8"),
        cipher.final(),
      ]).toString("base64"),
    };
    this.values[id].tag = cipher.getAuthTag().toString("base64");
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.values), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  has(id) {
    return Object.hasOwn(this.values, id);
  }
  get(id) {
    const v = this.values[id];
    if (!v) throw Error("Secret not configured");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(v.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(v.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(v.value, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
export async function temporaryFiles(files, action) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "backup-impresa-"));
  fs.chmodSync(root, 0o700);
  try {
    const paths = {};
    for (const [name, value] of Object.entries(files)) {
      paths[name] = path.join(root, name);
      fs.writeFileSync(paths[name], value, { mode: 0o600 });
    }
    return await action(paths);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
export function command(
  binary,
  args,
  { env = {}, timeout = 3600000, maxBytes = 16 * 1024 * 1024, input } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      env: { ...process.env, ...env, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      size = 0,
      problem,
      done = false;
    const stop = (why) => {
      problem = why;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!done) child.kill("SIGKILL");
      }, 2000).unref();
    };
    const timer = setTimeout(() => stop("Operation timed out"), timeout);
    child.stdout.on("data", (b) => {
      size += b.length;
      if (size > maxBytes) stop("Output limit exceeded");
      else stdout += b.toString();
    });
    child.stderr.on("data", (b) => {
      stderr = (stderr + b.toString()).slice(-65536);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(Error(`${binary}: ${e.code || "cannot start"}`));
    });
    child.on("close", (code, signal) => {
      done = true;
      clearTimeout(timer);
      if (problem) reject(Error(problem));
      else if (code !== 0) {
        const e = Error(
          `${binary}: exit ${code ?? signal}. Check connection, permissions and configuration.`,
        );
        e.exitCode = code;
        Object.defineProperty(e, "diagnostic", { value: stderr });
        reject(e);
      } else resolve({ stdout, stderr, code });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}
