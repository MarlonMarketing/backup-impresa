import { Access } from "./access.mjs";
import { Transports } from "./transports.mjs";

// All machine clients and invited users pass through the same resource checks.
export class Gateway {
  constructor({ store, control, engine, env, sources, notifier, runner }) {
    Object.assign(this, { store, control, engine });
    this.access = new Access(store);
    this.transports = new Transports({
      store,
      vault: control.vault,
      env,
      sources,
      restoreRoot: env.RESTORE_ROOT || "/restores",
      runner,
      isBusy: () =>
        Boolean(
          engine.active ||
            engine.queue?.length ||
            control.active ||
            control.queue.length,
        ),
      notify: (r) => notifier.send(r),
    });
  }
  catalog(actor) {
    const a = this.access,
      items = [
        ...this.store.state.jobs.map((p) => ({
          id: "legacy:" + p.id,
          name: p.name,
          format: "readable",
          enabled: p.enabled,
        })),
        ...this.control.state.tasks.map((p) => ({
          id: "control:" + p.id,
          name: p.name,
          format: p.type,
          enabled: p.enabled,
        })),
        ...this.transports.state.plans.map((p) => ({
          id: "transport:" + p.id,
          name: p.name,
          format: p.format,
          enabled: p.enabled,
        })),
      ];
    return {
      plans: items.filter((p) => a.allowed(actor, "read", p.id)),
      locations: this.transports.state.locations
        .filter((p) => a.allowed(actor, "read", "location:" + p.id))
        .map(({ id, name, role }) => ({ id, name, role })),
    };
  }
  runs(actor) {
    return [
      ...this.store.state.runs.map((r) => ({
        ...r,
        resource: "legacy:" + r.jobId,
      })),
      ...this.control.state.runs.map((r) => ({
        ...r,
        resource: r.taskId
          ? "control:" + r.taskId
          : "control:" +
            this.control.state.tasks.find(
              (t) =>
                t.repositoryId === r.repositoryId &&
                this.access.allowed(actor, "read", "control:" + t.id),
            )?.id,
      })),
      ...this.transports.state.runs.map((r) => ({
        ...r,
        resource: "transport:" + r.planId,
      })),
    ]
      .filter((r) => this.access.allowed(actor, "read", r.resource))
      .sort((a, b) => String(b.queuedAt).localeCompare(String(a.queuedAt)))
      .slice(0, 100)
      .map((r) => ({
        id: r.id,
        resource: r.resource,
        name: r.name,
        mode: r.mode,
        status: r.status,
        queuedAt: r.queuedAt,
        finishedAt: r.finishedAt,
        error: r.error,
        result: r.result
          ? {
              bytes: r.result.bytes,
              verification: r.result.verification,
              snapshots: r.result.snapshots?.map((s) => ({
                id: s.id,
                shortId: s.short_id,
                time: s.time,
              })),
              restorePath: this.access.allowed(actor, "restore", r.resource)
                ? r.result.restorePath
                : undefined,
            }
          : undefined,
      }));
  }
  run(actor, b, key) {
    const resource = b.resource || "",
      match = /^(legacy|control|transport):([a-z][a-z0-9-]{0,39})$/.exec(
        resource,
      );
    if (!match) throw Error("Choose a catalog plan identifier.");
    const [, kind, id] = match,
      mode = b.mode,
      readOnly = ["preview", "verify", "verify-pull", "check", "snapshots"];
    this.access.require(
      actor,
      mode === "restore" ? "restore" : "run",
      resource,
    );
    if (!["copy", "pull", "backup", ...readOnly, "restore"].includes(mode))
      throw Error("Operation not allowed through the API.");
    return this.access.idempotent(actor, key, b, () => {
      if (
        this.engine.active ||
        this.engine.queue?.length ||
        this.control.active ||
        this.control.queue.length ||
        this.transports.active
      )
        throw Error("Another operation is active.");
      let run;
      if (kind === "legacy") {
        const job = this.store.state.jobs.find((j) => j.id === id);
        if (!job || !["copy", "preview", "verify", "restore"].includes(mode))
          throw Error("Plan or operation unavailable.");
        run = this.engine.enqueue(
          job,
          mode,
          { relative: b.relative, versionId: b.versionId },
          "api",
        );
      }
      if (kind === "control") {
        const task = this.control.state.tasks.find((t) => t.id === id);
        if (!task) throw Error("Plan not found.");
        if (mode === "restore")
          throw Error("Use owner recovery for legacy protected archives.");
        if (["check", "snapshots"].includes(mode) && task.type !== "restic")
          throw Error("Operation unavailable for this plan.");
        run = this.control.enqueue(
          ["check", "snapshots"].includes(mode)
            ? { repositoryId: task.repositoryId, mode }
            : { taskId: id, mode },
          "api",
        );
      }
      if (kind === "transport")
        run = this.transports.enqueue(
          {
            planId: id,
            mode,
            relative: b.relative,
            version: b.version,
            snapshot: b.snapshot,
          },
          "api",
        );
      this.access.audit(actor, "plan:run", resource);
      return { run: { id: run.id, status: run.status, resource, mode } };
    });
  }
  status(actor) {
    return { catalog: this.catalog(actor), runs: this.runs(actor) };
  }
  redactStatus(body, actor) {
    const a = this.access,
      t = this.transports.publicState();
    body.access = a.publicState(actor);
    if (actor.owner) {
      body.transports = t;
      return body;
    }
    body.jobs = body.jobs.filter((p) =>
      a.allowed(actor, "read", "legacy:" + p.id),
    );
    body.runs = body.runs.filter((p) =>
      a.allowed(actor, "read", "legacy:" + p.jobId),
    );
    body.sources = body.sources.filter((s) =>
      body.jobs.some((p) => p.sourceId === s.id),
    );
    body.alerts = [];
    body.notifications = { last: {} };
    body.target = { online: false };
    body.targetName = "Restricted account";
    body.active = null;
    body.control = {
      ...body.control,
      servers: [],
      repositories: [],
      tasks: body.control.tasks.filter((p) =>
        a.allowed(actor, "read", "control:" + p.id),
      ),
      runs: body.control.runs.filter((p) =>
        a.allowed(actor, "read", "control:" + p.taskId),
      ),
      storage: [],
      settings: {},
      deliveries: [],
      staging: undefined,
      repositoryRoot: undefined,
      active: null,
    };
    body.transports = {
      ...t,
      connections: [],
      locations: t.locations
        .filter((p) => a.allowed(actor, "read", "location:" + p.id))
        .map(({ id, name, role }) => ({ id, name, role })),
      plans: t.plans.filter((p) =>
        a.allowed(actor, "read", "transport:" + p.id),
      ),
      runs: t.runs.filter((p) =>
        a.allowed(actor, "read", "transport:" + p.planId),
      ),
      active: null,
      localRoots: [],
    };
    return body;
  }
  async sessionRoute(req, url, actor, readBody) {
    const a = this.access,
      t = this.transports,
      p = url.pathname;
    if (p === "/api/access" && req.method === "GET")
      return a.publicState(actor);
    if (p.startsWith("/api/access/") && req.method === "POST") {
      const b = await readBody(req);
      a.requireOwner(actor);
      const methods = {
        "/api/access/invite": "invite",
        "/api/access/user": "updateUser",
        "/api/access/token": "issue",
        "/api/access/revoke": "revoke",
      };
      if (methods[p]) return a[methods[p]](actor, b);
      if (p === "/api/access/review")
        return a.approve(actor, b, (d) => {
          if (t.state.plans.some((p) => p.id === d.id))
            throw Error("A plan with this identifier already exists.");
          return t.savePlan({ ...d, archivePassword: b.archivePassword });
        });
    }
    if (p === "/api/catalog" && req.method === "GET")
      return this.catalog(actor);
    if (p === "/api/agent/run" && req.method === "POST")
      return this.run(
        actor,
        await readBody(req),
        req.headers["idempotency-key"],
      );
    if (p.startsWith("/api/transports/") && req.method === "POST") {
      const b = await readBody(req);
      if (p === "/api/transports/run") {
        a.require(
          actor,
          b.mode === "restore" ? "restore" : "run",
          "transport:" + b.planId,
        );
        return { run: t.enqueue(b) };
      }
      if (p === "/api/transports/browse") {
        a.require(actor, "restore", "transport:" + b.planId);
        return t.browse(b);
      }
      if (p === "/api/transports/plan" && !actor.owner) {
        a.require(actor, "configure", "transport:" + b.id);
        if (!t.state.plans.some((p) => p.id === b.id) || b.archivePassword)
          throw Object.assign(Error("Owner access required."), { status: 403 });
        return { plan: t.savePlan(b) };
      }
      a.requireOwner(actor);
      if (p === "/api/transports/connection")
        return { connection: t.saveConnection(b) };
      if (p === "/api/transports/location")
        return { location: t.saveLocation(b) };
      if (p === "/api/transports/initialize")
        return t.initializeLocation(b.id, b.confirm);
      if (p === "/api/transports/test") return t.testConnection(b.id, b.path);
      if (p === "/api/transports/plan") return { plan: t.savePlan(b) };
    }
    return undefined;
  }
  legacyPermission(actor, url, method, body) {
    if (actor.owner || ["/api/status", "/api/logout"].includes(url.pathname))
      return;
    const a = this.access,
      p = url.pathname;
    if (p === "/api/run") {
      a.require(
        actor,
        body.mode === "restore" ? "restore" : "run",
        "legacy:" + body.jobId,
      );
      return;
    }
    if (p === "/api/files") {
      a.require(actor, "restore", "legacy:" + url.searchParams.get("jobId"));
      return;
    }
    if (p === "/api/log") {
      const run = this.store.state.runs.find(
        (r) => r.id === url.searchParams.get("id"),
      );
      a.require(actor, "read", "legacy:" + run?.jobId);
      return;
    }
    if (p === "/api/control/run") {
      if (!["pull", "verify-pull", "backup"].includes(body.mode))
        throw Object.assign(
          Error("Use the scoped plan API for repository operations."),
          { status: 403 },
        );
      a.require(actor, "run", "control:" + body.taskId);
      return;
    }
    a.requireOwner(actor);
  }
  async machine(req, url, readBody) {
    const mcp = url.pathname === "/mcp",
      actor = this.access.authenticate(
        (req.headers.authorization || "").replace(/^Bearer /, ""),
        mcp ? "mcp" : "api",
      );
    if (!actor)
      throw Object.assign(Error("A valid scoped bearer token is required."), {
        status: 401,
      });
    if (
      req.headers.origin &&
      new URL(req.headers.origin).host !== req.headers.host
    )
      throw Object.assign(Error("Origin rejected."), { status: 403 });
    if (mcp) {
      if (req.method !== "POST")
        return {
          status: 405,
          body: { error: "Use stateless Streamable HTTP POST." },
        };
      const b = await readBody(req);
      if (b.jsonrpc !== "2.0" || Array.isArray(b))
        throw Error("Invalid JSON-RPC request.");
      if (b.id === undefined) {
        if (b.method === "notifications/initialized") return { status: 202 };
        throw Error("Unsupported notification.");
      }
      try {
        let result;
        if (b.method === "initialize") {
          const versions = ["2025-03-26", "2025-06-18", "2025-11-25"];
          result = {
            protocolVersion: versions.includes(b.params?.protocolVersion)
              ? b.params.protocolVersion
              : "2025-11-25",
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: "backup-impresa", version: "0.4.0" },
            instructions:
              "Read only unless the owner grants run/propose. Proposals never create schedules. No shell or credential access.",
          };
        } else if (b.method === "ping") result = {};
        else if (b.method === "tools/list")
          result = { tools: this.tools(actor) };
        else if (b.method === "tools/call") {
          const name = b.params?.name,
            args = b.params?.arguments || {};
          if (!this.tools(actor).some((t) => t.name === name))
            throw Error("Tool not permitted.");
          let value;
          if (name === "backup_catalog") value = this.catalog(actor);
          else if (name === "backup_status") value = this.status(actor);
          else if (name === "backup_run")
            value = this.run(actor, args, args.idempotencyKey);
          else value = this.propose(actor, args, args.idempotencyKey);
          result = {
            content: [{ type: "text", text: JSON.stringify(value) }],
            isError: false,
          };
        } else
          return {
            status: 200,
            body: {
              jsonrpc: "2.0",
              id: b.id,
              error: { code: -32601, message: "Method not found." },
            },
          };
        return { status: 200, body: { jsonrpc: "2.0", id: b.id, result } };
      } catch (e) {
        return {
          status: 200,
          body: {
            jsonrpc: "2.0",
            id: b.id,
            error: { code: -32602, message: e.message },
          },
        };
      }
    }
    if (req.method === "GET" && url.pathname === "/api/v1/catalog")
      return { status: 200, body: this.catalog(actor) };
    if (req.method === "GET" && url.pathname === "/api/v1/status")
      return { status: 200, body: this.status(actor) };
    if (req.method === "POST" && url.pathname === "/api/v1/run")
      return {
        status: 202,
        body: this.run(
          actor,
          await readBody(req),
          req.headers["idempotency-key"],
        ),
      };
    if (req.method === "POST" && url.pathname === "/api/v1/proposals")
      return {
        status: 201,
        body: this.propose(
          actor,
          await readBody(req),
          req.headers["idempotency-key"],
        ),
      };
    return { status: 404, body: { error: "Endpoint not found." } };
  }
  propose(actor, b, key) {
    if (this.transports.state.plans.some((p) => p.id === b.id))
      throw Error("A plan with this identifier already exists.");
    if (b.archivePassword || b.password || b.token)
      throw Error("Never send secrets in plan proposals.");
    return this.access.idempotent(actor, key, b, () => ({
      proposal: this.access.propose(actor, b, (d) =>
        this.transports.validatePlan(d),
      ),
    }));
  }
  tools(actor) {
    const object = (properties) => ({
        type: "object",
        properties,
        additionalProperties: false,
      }),
      str = { type: "string" },
      tools = [];
    if (actor.scopes.includes("read"))
      tools.push(
        {
          name: "backup_catalog",
          description:
            "List only authorized backup plans and location identifiers.",
          inputSchema: object({}),
        },
        {
          name: "backup_status",
          description:
            "Read authorized run outcomes. Never returns credentials.",
          inputSchema: object({}),
        },
      );
    if (actor.scopes.includes("run") || actor.scopes.includes("restore"))
      tools.push({
        name: "backup_run",
        description:
          "Run an existing allowed plan. Requires a unique idempotencyKey. Restore needs its own scope. Cannot initialize or erase archives.",
        inputSchema: {
          ...object({
            resource: str,
            mode: {
              type: "string",
              enum: [
                "copy",
                "pull",
                "backup",
                "preview",
                "verify",
                "verify-pull",
                "check",
                "snapshots",
                "restore",
              ],
            },
            idempotencyKey: str,
            relative: str,
            version: str,
            versionId: str,
            snapshot: str,
          }),
          required: ["resource", "mode", "idempotencyKey"],
        },
      });
    if (actor.scopes.includes("propose"))
      tools.push({
        name: "backup_propose",
        description:
          "Submit a disabled plan draft for explicit owner review. Does not copy files or enable schedules.",
        inputSchema: {
          ...object({
            id: str,
            name: str,
            sourceId: str,
            destinationId: str,
            format: { type: "string", enum: ["readable", "protected"] },
            idempotencyKey: str,
          }),
          required: [
            "id",
            "name",
            "sourceId",
            "destinationId",
            "idempotencyKey",
          ],
        },
      });
    return tools.map((tool) => ({
      ...tool,
      annotations: {
        readOnlyHint: ["backup_catalog", "backup_status"].includes(tool.name),
        destructiveHint: false,
        openWorldHint: tool.name === "backup_run",
        idempotentHint: true,
      },
    }));
  }
}
