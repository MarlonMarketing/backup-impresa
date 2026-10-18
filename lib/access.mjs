import crypto from "node:crypto";
const hash = (v) => crypto.createHash("sha256").update(v).digest("hex");
const secret = () => crypto.randomBytes(32).toString("base64url");
const name = (v) => {
  if (typeof v !== "string" || !v.trim() || v.length > 100)
    throw Error("Name required (max 100 characters).");
  return v.trim();
};
export const SCOPES = ["read", "run", "propose", "restore", "configure"];
export const ROLE_SCOPES = {
  viewer: ["read"],
  operator: ["read", "run"],
  proposer: ["read", "propose"],
  maintainer: ["read", "run", "propose", "restore", "configure"],
};
export class Access {
  constructor(store) {
    this.store = store;
    store.state.access ??= {
      users: [],
      tokens: [],
      invitations: [],
      proposals: [],
      audit: [],
      receipts: [],
    };
    this.state = store.state.access;
    this.limits = new Map();
    store.save();
  }
  audit(actor, action, resource, result = "success") {
    this.state.audit.unshift({
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actor: actor?.id || "owner",
      action,
      resource,
      result,
    });
    this.state.audit = this.state.audit.slice(0, 3000);
    this.store.save();
  }
  owner() {
    return {
      id: "owner",
      owner: true,
      role: "owner",
      scopes: SCOPES,
      resources: ["*"],
    };
  }
  principal(user) {
    return {
      id: user.id,
      role: user.role,
      scopes: ROLE_SCOPES[user.role] || [],
      resources: user.resources || [],
    };
  }
  allowed(actor, scope, resource) {
    if (actor?.owner) return true;
    if (!actor || !actor.scopes?.includes(scope)) return false;
    return (
      actor.resources?.includes("*") || actor.resources?.includes(resource)
    );
  }
  require(actor, scope, resource) {
    if (!this.allowed(actor, scope, resource)) {
      this.audit(actor, "denied:" + scope, resource, "denied");
      throw Object.assign(Error("Permission denied."), { status: 403 });
    }
  }
  requireOwner(actor) {
    if (!actor?.owner)
      throw Object.assign(Error("Owner access required."), { status: 403 });
  }
  resolveSession(session) {
    if (!session) return null;
    if (!session.userId) return this.owner();
    const user = this.state.users.find(
      (u) => u.id === session.userId && !u.disabled,
    );
    return user ? this.principal(user) : null;
  }
  resources(value) {
    if (
      !Array.isArray(value) ||
      value.length > 200 ||
      value.some(
        (v) =>
          typeof v !== "string" ||
          v.length > 100 ||
          !/^(\*|(?:legacy|control|transport|location|connection|source|repository):[a-z][a-z0-9-]{0,39})$/.test(
            v,
          ),
      )
    )
      throw Error("Invalid resource allowlist.");
    return [...new Set(value)];
  }
  invite(actor, body) {
    this.requireOwner(actor);
    if (
      this.state.users.length >= 100 ||
      this.state.invitations.filter((i) => !i.used && !i.revoked).length >= 100
    )
      throw Error("Account limit reached.");
    if (!ROLE_SCOPES[body.role]) throw Error("Invalid role.");
    const token = secret(),
      entry = {
        id: crypto.randomUUID(),
        name: name(body.name),
        role: body.role,
        resources: this.resources(body.resources || []),
        hash: hash(token),
        expires: Date.now() + 48 * 3600000,
        used: false,
      };
    this.state.invitations.push(entry);
    this.audit(actor, "invite:create", entry.id);
    return { id: entry.id, token, expires: entry.expires };
  }
  accept(body, passwordHash) {
    if (typeof body.token !== "string" || body.token.length > 200)
      throw Error("Invalid invitation.");
    const invite = this.state.invitations.find(
      (i) =>
        i.hash === hash(body.token) &&
        !i.used &&
        !i.revoked &&
        i.expires > Date.now(),
    );
    if (!invite) throw Error("Invitation invalid or expired.");
    if (
      typeof body.username !== "string" ||
      !/^[a-zA-Z0-9_.-]{3,40}$/.test(body.username) ||
      typeof body.password !== "string" ||
      body.password.length < 12 ||
      body.password.length > 200
    )
      throw Error("Username 3–40; password 12–200 characters.");
    if (
      this.state.users.some(
        (u) => u.username.toLowerCase() === body.username.toLowerCase(),
      ) ||
      this.store.state.admin?.username.toLowerCase() ===
        body.username.toLowerCase()
    )
      throw Error("Username already exists.");
    const user = {
      id: crypto.randomUUID(),
      name: invite.name,
      username: body.username,
      password: passwordHash(body.password),
      role: invite.role,
      resources: invite.resources,
      createdAt: new Date().toISOString(),
      disabled: false,
    };
    this.state.users.push(user);
    invite.used = true;
    this.audit({ id: user.id }, "invite:accept", invite.id);
    return { ok: true };
  }
  updateUser(actor, body) {
    this.requireOwner(actor);
    const u = this.state.users.find((u) => u.id === body.id);
    if (!u) throw Error("User not found.");
    if (!ROLE_SCOPES[body.role]) throw Error("Invalid role.");
    u.role = body.role;
    u.resources = this.resources(body.resources || []);
    u.disabled = body.disabled === true;
    this.audit(actor, "user:update", u.id);
    return { ok: true };
  }
  issue(actor, body) {
    this.requireOwner(actor);
    if (this.state.tokens.length >= 200)
      throw Error("Access token limit reached.");
    if (
      !Array.isArray(body.scopes) ||
      !body.scopes.length ||
      body.scopes.some((s) => !SCOPES.includes(s))
    )
      throw Error("Invalid scopes.");
    if (!["api", "mcp", "both"].includes(body.channel))
      throw Error("Invalid token channel.");
    const days = Number(body.days ?? 30);
    if (!Number.isInteger(days) || days < 1 || days > 365)
      throw Error("Expiry must be 1–365 days.");
    const token = "bi_" + secret(),
      entry = {
        id: crypto.randomUUID(),
        name: name(body.name),
        hash: hash(token),
        channel: body.channel,
        scopes: [...new Set(body.scopes)],
        resources: this.resources(body.resources || []),
        expires: Date.now() + days * 86400000,
        createdAt: new Date().toISOString(),
        revoked: false,
      };
    this.state.tokens.push(entry);
    this.audit(actor, "token:create", entry.id);
    return { id: entry.id, token, expires: entry.expires };
  }
  authenticate(value, channel) {
    if (typeof value !== "string" || value.length > 200) return null;
    const h = hash(value),
      entry = this.state.tokens.find(
        (t) =>
          t.hash === h &&
          !t.revoked &&
          t.expires > Date.now() &&
          [channel, "both"].includes(t.channel),
      );
    if (!entry) return null;
    const now = Date.now(),
      rate = this.limits.get(entry.id) || { at: now, count: 0 };
    if (now - rate.at >= 60000) {
      rate.at = now;
      rate.count = 0;
    }
    if (++rate.count > 60)
      throw Object.assign(Error("Rate limit exceeded."), { status: 429 });
    this.limits.set(entry.id, rate);
    if (!entry.lastUsed || now - entry.lastUsed > 60000) {
      entry.lastUsed = now;
      this.store.save();
    }
    return {
      id: "token:" + entry.id,
      scopes: entry.scopes,
      resources: entry.resources,
      tokenId: entry.id,
    };
  }
  revoke(actor, body) {
    this.requireOwner(actor);
    const collection =
      body.kind === "invitation" ? this.state.invitations : this.state.tokens;
    const item = collection.find((i) => i.id === body.id);
    if (!item) throw Error("Access not found.");
    item.revoked = true;
    this.audit(actor, "access:revoke", item.id);
    return { ok: true };
  }
  publicState(actor) {
    if (!actor?.owner)
      return {
        principal: actor,
        proposals: this.state.proposals
          .filter((p) => p.actor === actor.id)
          .map((p) => ({ ...p })),
      };
    return {
      principal: actor,
      users: this.state.users.map(({ password, ...u }) => u),
      tokens: this.state.tokens.map(({ hash, ...t }) => t),
      invitations: this.state.invitations.map(({ hash, ...i }) => i),
      proposals: this.state.proposals,
      audit: this.state.audit.slice(0, 200),
      scopes: SCOPES,
      roles: Object.keys(ROLE_SCOPES),
    };
  }
  propose(actor, body, validate) {
    if (
      this.state.proposals.filter((p) => p.status === "pending").length >= 100
    )
      throw Error("Pending proposal limit reached.");
    this.require(actor, "propose", "location:" + body.sourceId);
    this.require(actor, "propose", "location:" + body.destinationId);
    const draft = validate({ ...body, enabled: false, verifyEnabled: false });
    const p = {
      id: crypto.randomUUID(),
      actor: actor.id,
      at: new Date().toISOString(),
      expires: Date.now() + 48 * 3600000,
      status: "pending",
      draft,
      digest: hash(JSON.stringify(draft)),
    };
    this.state.proposals.unshift(p);
    this.audit(actor, "plan:propose", p.id);
    return p;
  }
  approve(actor, body, save) {
    this.requireOwner(actor);
    const p = this.state.proposals.find((p) => p.id === body.id);
    if (
      !p ||
      p.status !== "pending" ||
      p.expires < Date.now() ||
      body.digest !== p.digest ||
      hash(JSON.stringify(p.draft)) !== p.digest
    )
      throw Error("Proposal changed, expired or already reviewed.");
    if (body.decision === "reject") {
      p.status = "rejected";
      this.audit(actor, "plan:reject", p.id);
      return { ok: true };
    }
    if (body.decision !== "approve") throw Error("Explicit approval required.");
    const plan = save({ ...p.draft, enabled: false, verifyEnabled: false });
    p.status = "approved";
    p.planId = plan.id;
    this.audit(actor, "plan:approve", p.id);
    return { plan };
  }
  idempotent(actor, key, body, action) {
    if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(key || ""))
      throw Error("Idempotency-Key required (8–128 characters).");
    const signature = hash(JSON.stringify(body)),
      old = this.state.receipts.find(
        (r) => r.actor === actor.id && r.key === key,
      );
    if (old) {
      if (old.signature !== signature)
        throw Error("Idempotency key already used for a different request.");
      return { ...old.response, duplicate: true };
    }
    const response = action();
    this.state.receipts.unshift({ actor: actor.id, key, signature, response });
    this.state.receipts = this.state.receipts.slice(0, 1000);
    this.store.save();
    return response;
  }
}
