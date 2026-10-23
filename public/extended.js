import { translate } from "/i18n.js";
import { guideForm } from "/wizard.js";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function mountExtended({ api, refresh, message, language }) {
  let state;
  const t = (k, v) => translate(language(), k, v),
    dialog = document.createElement("dialog");
  dialog.id = "extended-dialog";
  document.body.append(dialog);
  const root = document.createElement("div");
  root.id = "extended-panel";
  document.querySelector("#dashboard").append(root);
  const select = (name, label, options, value = "") =>
    `<label>${t(label)}<select name="${name}">${options.map(([v, n]) => `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`;
  const input = (name, label, type = "text", value = "", required = false) =>
    `<label>${t(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} autocomplete="${type === "password" ? "new-password" : "off"}"></label>`;
  const area = (name, label, value = "") =>
    `<label>${t(label)}<textarea name="${name}" rows="3" spellcheck="false" autocomplete="off">${esc(value)}</textarea></label>`;
  const check = (name, label, value = false) =>
    `<label class="check"><input type="checkbox" name="${name}" ${value ? "checked" : ""}>${t(label)}</label>`;
  const button = (action, label, id = "") =>
    `<button class="ghost" type="button" data-ext="${action}" data-id="${esc(id)}">${t(label)}</button>`;
  const card = (title, body, pages) =>
    `<section class="card extended-card" data-pages="${pages}"><h2>${t(title)}</h2>${body}</section>`;
  function show(title, body, submit, steps) {
    dialog.innerHTML = `<form><div class="section-head"><h2>${t(title)}</h2>${button("close", "close")}</div>${body}<button class="primary" type="submit">${t("confirm")}</button></form>`;
    const f = dialog.querySelector("form");
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await submit(f);
        dialog.close();
        await refresh();
        message(t("saved"));
      } catch (e) {
        message(e.message, true);
      }
    };
    if (steps) guideForm(f, steps, t)();
    dialog.showModal();
    return f;
  }
  function details(value) {
    dialog.innerHTML = `<h2>${t("resultDetail")}</h2><pre></pre>${button("close", "close")}`;
    dialog.querySelector("pre").textContent =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    dialog.showModal();
  }
  const data = (f) => Object.fromEntries(new FormData(f)),
    list = (v) =>
      v
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
  function connection(existing) {
    const types = state.transports.providers;
    const f = show(
      "newConnection",
      input("id", "resourceId", "text", "", true) +
        input("name", "name", "text", "", true) +
        select(
          "type",
          "protocol",
          types.map((v) => [
            v,
            {
              local: "Local / USB / NFS",
              drive: "Google Drive",
              onedrive: "OneDrive",
              dropbox: "Dropbox",
              webdav: "WebDAV / Nextcloud",
            }[v] || v.toUpperCase(),
          ]),
        ) +
        '<div id="protocol-fields"></div>',
      (f) => {
        const b = data(f);
        for (const k of ["hostKeyVerified", "allowPlaintext"])
          b[k] = Boolean(f.elements[k]?.checked);
        return api("/api/transports/connection", b);
      },
    );
    const update = () => {
      const type = f.elements.type.value;
      let html = "";
      if (["sftp", "ftp", "ftps", "smb"].includes(type))
        html +=
          input("host", "host", "text", "", true) +
          input(
            "port",
            "port",
            "number",
            { sftp: 22, ftp: 21, ftps: 21, smb: 445 }[type],
          ) +
          input("user", "user", "text", "", true) +
          input("password", "password", "password");
      if (type === "sftp")
        html +=
          area("hostKey", "hostKey") +
          `<p class="help-copy">${t("hostKeyHelp")}</p>` +
          check("hostKeyVerified", "confirmHostKey") +
          area("privateKey", "privateKey") +
          input("keyPassphrase", "keyPassphrase", "password");
      if (type === "ftp") html += check("allowPlaintext", "plainFTP");
      if (type === "ftps")
        html += select("tlsMode", "protocol", [
          ["explicit", "Explicit TLS"],
          ["implicit", "Implicit TLS"],
        ]);
      if (type === "webdav")
        html +=
          input("url", "endpoint", "url", "", true) +
          input("user", "user") +
          input("password", "password", "password") +
          select("vendor", "protocol", [
            ["nextcloud", "Nextcloud"],
            ["owncloud", "ownCloud"],
            ["other", "WebDAV"],
          ]);
      if (type === "s3")
        html +=
          input("endpoint", "endpoint", "url") +
          input("region", "region", "text", "us-east-1") +
          input("accessKey", "accessKey") +
          input("secretKey", "secretKey", "password");
      if (type === "smb") html += input("domain", "domain");
      if (["drive", "onedrive", "dropbox"].includes(type)) {
        html +=
          `<p>${t("cloudHelp")}</p>` +
          area("oauthToken", "oauthToken") +
          input("clientId", "clientId") +
          input("clientSecret", "clientSecret", "password");
        if (type === "onedrive")
          html +=
            input("driveId", "driveId") +
            select("driveType", "driveType", [
              ["personal", "Personal"],
              ["business", "Business"],
              ["documentLibrary", "Document library"],
            ]);
        if (type === "drive") html += input("rootFolderId", "rootFolderId");
      }
      if (["ftps", "webdav", "s3"].includes(type))
        html += area("caCert", "caCert");
      if (type === "local") html += `<p>${t("localHelp")}</p>`;
      f.querySelector("#protocol-fields").innerHTML =
        html + `<p class="muted">${t("credentialsHelp")}</p>`;
    };
    f.elements.type.onchange = update;
    update();
    if (existing) {
      for (const k of ["id", "name", "type"]) f.elements[k].value = existing[k];
      f.elements.id.readOnly = true;
      f.elements.type.disabled = true;
      update();
      for (const [k, v] of Object.entries(existing)) {
        const el = f.elements[k];
        if (el && el.type !== "checkbox") el.value = v;
      }
      const submit = f.onsubmit;
      f.onsubmit = async (e) => {
        f.elements.type.disabled = false;
        try {
          await submit(e);
        } finally {
          f.elements.type.disabled = true;
        }
      };
    }
  }
  function locationForm() {
    show(
      "newLocation",
      input("id", "resourceId", "text", "", true) +
        input("name", "name", "text", "", true) +
        select(
          "connectionId",
          "connection",
          state.transports.connections.map((c) => [c.id, c.name]),
        ) +
        select("role", "folderRole", [
          ["source", t("sourceRole")],
          ["destination", t("destinationRole")],
        ]) +
        input("path", "folderPath", "text", "", true) +
        select("presetSourceId", "presetSource", [["", t("newFolderIdentity")],
          ...state.sources.map(s => [s.id, s.name])]) +
        `<p class="help-copy">${t("presetHelp")}</p>` +
        `<p class="help-copy">${t("localHelp")}</p>`,
      (f) => api("/api/transports/location", data(f)),
    );
  }
  function planForm(p) {
    const tr = state.transports;
    const form = show(
      "newTransport",
      input("id", "resourceId", "text", p?.id || "", true) +
        input("name", "name", "text", p?.name || "", true) +
        select(
          "sourceId",
          "sourceFolder",
          tr.locations
            .filter((l) => l.role === "source")
            .map((l) => [l.id, l.name]),
          p?.sourceId,
        ) +
        select(
          "destinationId",
          "destinationFolder",
          tr.locations
            .filter((l) => l.role === "destination")
            .map((l) => [l.id, l.name]),
          p?.destinationId,
        ) +
        select(
          "format",
          "format",
          [
            ["readable", t("readableFormat")],
            ["protected", t("protectedFormat")],
          ],
          p?.format,
        ) +
        (!p ? input("archivePassword", "archivePassword", "password") : "") +
        select("copyMode", "copyMode", [
          ["verified", t("verifiedMode")], ["incremental", t("incrementalMode")],
        ], p?.copyMode || "verified") +
        `<p class="help-copy">${t("incrementalHelp")}</p>` +
        input("maxRunMinutes", "maxRunMinutes", "number", p?.maxRunMinutes ?? 240, true) +
        input("maxVerifyMinutes", "maxVerifyMinutes", "number", p?.maxVerifyMinutes ?? 720, true) +
        `<p class="help-copy">${t("transportHelp")}</p>` +
        input("time", "dailyAt", "time", p?.time || "18:00") +
        check("enabled", "enableCopy", p?.enabled) +
        select(
          "verifyDay",
          "verifyDay",
          Array.from({ length: 7 }, (_, i) => [
            String(i),
            new Intl.DateTimeFormat(language(), {
              weekday: "long",
              timeZone: "UTC",
            }).format(new Date(Date.UTC(2026, 9, 18 + i))),
          ]),
          String(p?.verifyDay ?? 0),
        ) +
        input("verifyTime", "verifyAt", "time", p?.verifyTime || "12:30") +
        check("verifyEnabled", "enableVerify", p?.verifyEnabled),
      (f) =>
        api("/api/transports/plan", {
          ...data(f),
          ...(p
            ? {
                id: p.id,
                sourceId: p.sourceId,
                destinationId: p.destinationId,
                format: p.format,
              }
            : {}),
          enabled: f.elements.enabled.checked,
          verifyEnabled: f.elements.verifyEnabled.checked,
        }),
      [
        { title: "sourceStep", fields: ["id", "name", "sourceId"] },
        {
          title: "destinationStep",
          fields: ["destinationId", "format", "archivePassword", "copyMode", "maxRunMinutes", "maxVerifyMinutes"],
        },
        {
          title: "scheduleStep",
          fields: [
            "time",
            "enabled",
            "verifyDay",
            "verifyTime",
            "verifyEnabled",
          ],
        },
      ],
    );
    if (p) {
      form.elements.id.readOnly = true;
      for (const key of ["sourceId", "destinationId", "format"])
        form.elements[key].disabled = true;
    }
  }
  async function browse(id, version = "current", folder = "") {
    const r = await api("/api/transports/browse", {
      planId: id,
      version,
      path: folder,
    });
    dialog.innerHTML = `<h2>${t("browse")}</h2><p>${t("recoveryHelp")}</p>${select("version", "version", [["current", t("currentCopy")], ...r.versions.map((v) => [v, v])], version)}<code>${esc(folder || "/")}</code><div class="actions">${button("browse-up", "parent", id)}</div><div>${r.files.map((f, i) => `<div class="notice-row"><span>${f.directory ? "▣ " : ""}${esc(f.name)} · ${f.bytes}</span><span>${f.directory ? `<button type="button" data-folder-index="${i}">${t("browse")}</button>` : ""}<button type="button" data-recover-index="${i}">${t("recover")}</button></span></div>`).join("")}</div>${button("close", "close")}`;
    dialog.querySelector("[name=version]").onchange = (e) =>
      browse(id, e.target.value, "").catch((e) => message(e.message, true));
    dialog.querySelector("[data-ext=browse-up]").onclick = () =>
      browse(id, version, folder.split("/").slice(0, -1).join("/")).catch((e) =>
        message(e.message, true),
      );
    dialog
      .querySelectorAll("[data-folder-index]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            browse(
              id,
              version,
              [folder, r.files[b.dataset.folderIndex].name]
                .filter(Boolean)
                .join("/"),
            ).catch((e) => message(e.message, true))),
      );
    dialog.querySelectorAll("[data-recover-index]").forEach(
      (b) =>
        (b.onclick = async () => {
          if (!confirm(t("restoreConfirm"))) return;
          try {
            const run = await api("/api/transports/run", {
              planId: id,
              mode: "restore",
              version,
              relative: [folder, r.files[b.dataset.recoverIndex].name]
                .filter(Boolean)
                .join("/"),
            });
            details(run);
            await refresh();
          } catch (e) {
            message(e.message, true);
          }
        }),
    );
    dialog.showModal();
  }
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-ext]");
    if (!b) return;
    try {
      const action = b.dataset.ext,
        id = b.dataset.id,
        owner = state.access.principal.owner;
      if (action === "connection") connection();
      if (action === "edit-connection")
        connection(state.transports.connections.find((c) => c.id === id));
      if (action === "location") locationForm();
      if (action === "plan") planForm();
      if (action === "edit-plan")
        planForm(state.transports.plans.find((p) => p.id === id));
      if (action === "test") {
        show("testConnection", input("path", "folderPath", "text",
          state.transports.locations.find((l) => l.connectionId === id)?.path || "", true),
          (f) => api("/api/transports/test", { id, path: f.elements.path.value }));
      }
      if (action === "initialize") {
        const l = state.transports.locations.find((l) => l.id === id);
        show(
          "initializeLocation",
          `<p>${t("initializeHelp")}</p><pre>${esc(l.path + "/.backup-impresa-location\n" + l.marker)}</pre>` +
            input("confirm", "folderId", "text", "", true),
          (f) =>
            api("/api/transports/initialize", {
              id,
              confirm: f.elements.confirm.value,
            }),
        );
      }
      if (
        [
          "copy",
          "preview",
          "verify",
          "backup",
          "check",
          "snapshots",
          "init",
        ].includes(action)
      ) {
        if (action === "init" && prompt(t("folderId")) !== id) return;
        await api("/api/transports/run", {
          planId: id,
          mode: action,
          confirm: action === "init" ? id : undefined,
        });
        await refresh();
      }
      if (action === "browse") await browse(id);
      if (action === "restore-protected")
        show(
          "recoverFile",
          input("snapshot", "folderId", "text", "", true) +
            `<p>${t("recoveryHelp")}</p>`,
          (f) =>
            api("/api/transports/run", {
              planId: id,
              mode: "restore",
              snapshot: f.elements.snapshot.value,
            }),
        );
      if (action === "result")
        details(state.transports.runs.find((r) => r.id === id));
      if (action === "invite")
        show(
          "inviteUser",
          input("name", "name", "text", "", true) +
            select(
              "role",
              "role",
              Object.keys({
                viewer: 1,
                operator: 1,
                proposer: 1,
                maintainer: 1,
              }).map((v) => [v, v]),
            ) +
            area("resources", "resources") +
            `<p>${t("resourceHelp")}</p>`,
          async (f) => {
            const r = await api("/api/access/invite", {
              ...data(f),
              resources: list(f.elements.resources.value),
            });
            setTimeout(() => details(t("oneTime") + "\n\n" + r.token), 0);
          },
        );
      if (action === "token")
        show(
          "createToken",
          input("name", "name", "text", "", true) +
            select("channel", "channel", [
              ["api", "API"],
              ["mcp", "MCP"],
              ["both", "API + MCP"],
            ]) +
            input("days", "expiryDays", "number", "30", true) +
            area("resources", "resources") +
            `<p>${t("resourceHelp")}</p>` +
            select("scopes", "scopes", [
              ["read", "read"],
              ["read,run", "read + run"],
              ["read,propose", "read + propose"],
              ["read,run,propose", "read + run + propose"],
              ["read,run,restore", "read + run + restore"],
            ]),
          async (f) => {
            const d = data(f),
              r = await api("/api/access/token", {
                ...d,
                scopes: list(d.scopes),
                resources: list(d.resources),
              });
            setTimeout(() => details(t("oneTime") + "\n\n" + r.token), 0);
          },
        );
      if (action === "revoke-token" || action === "revoke-invitation") {
        if (confirm(t("revoke"))) {
          await api("/api/access/revoke", {
            id,
            kind: action === "revoke-token" ? "token" : "invitation",
          });
          await refresh();
        }
      }
      if (action === "disable") {
        const u = state.access.users.find((u) => u.id === id);
        if (confirm(t("disableUser"))) {
          await api("/api/access/user", { ...u, disabled: true });
          await refresh();
        }
      }
      if (action === "permissions") {
        const u = state.access.users.find((u) => u.id === id);
        show(
          "resources",
          select(
            "role",
            "role",
            state.access.roles.map((v) => [v, v]),
            u.role,
          ) +
            area("resources", "resources", u.resources.join("\n")) +
            check("disabled", "accountDisabled", u.disabled),
          (f) =>
            api("/api/access/user", {
              id,
              role: f.elements.role.value,
              resources: list(f.elements.resources.value),
              disabled: f.elements.disabled.checked,
            }),
        );
      }
      if (action === "review") {
        const p = state.access.proposals.find((p) => p.id === id);
        show(
          "reviewProposal",
          `<pre>${esc(JSON.stringify(p.draft, null, 2))}</pre>` +
            (p.draft.format === "protected"
              ? input("archivePassword", "archivePassword", "password")
              : "") +
            select("decision", "action", [
              ["reject", t("rejectProposal")],
              ["approve", t("approveDisabled")],
            ]),
          (f) =>
            api("/api/access/review", {
              id,
              digest: p.digest,
              decision: f.elements.decision.value,
              archivePassword: f.elements.archivePassword?.value,
            }),
        );
      }
    } catch (e) {
      message(e.message, true);
    }
  });
  dialog.addEventListener("click", (e) => {
    if (e.target.closest("[data-ext=close]")) dialog.close();
  });
  // Invitation acceptance is public, but never signs a user in automatically.
  const accept = document.createElement("button");
  accept.className = "ghost";
  accept.textContent = t("inviteAccept");
  document.querySelector("#auth").append(accept);
  accept.onclick = () =>
    show(
      "inviteAccept",
      input("token", "invitationToken", "password", "", true) +
        input("username", "username", "text", "", true) +
        input("password", "password", "password", "", true),
      (f) => api("/api/access/accept", data(f)),
    );
  return (next) => {
    state = next;
    const tr = state.transports,
      a = state.access,
      owner = a.principal.owner;
    const can = (scope, id) =>
      owner ||
      (a.principal.scopes.includes(scope) &&
        (a.principal.resources.includes("*") ||
          a.principal.resources.includes("transport:" + id)));
    let html = "";
    html += card(
      "connectionsNav",
      `<p class="help-copy">${t("connectionsHelp")}</p><a href="/guide/${language()}/connections">${t("connectorGuide")}</a>${owner ? `<div class="actions">${button("connection", "newConnection")}${button("location", "newLocation")}${button("plan", "newTransport")}</div>` : ""}${tr.connections.map((c) => `<div class="notice-row"><span><strong>${esc(c.name)}</strong><small>${esc(c.type.toUpperCase())} · ${esc(c.id)} · ${c.lastTest ? esc(c.lastTest.ok ? t("connected") : t("attention")) : t("notRun")}</small></span>${owner ? button("test", "testConnection", c.id) + button("edit-connection", "configure", c.id) : ""}</div>`).join("") || `<p>${t("noEntries")}</p>`}`,
      "connections",
    );
    for (const role of ["source", "destination"])
      html += card(
        role === "source" ? "sourceFolder" : "destinationFolder",
        tr.locations
          .filter((l) => l.role === role)
          .map(
            (l) =>
              `<article class="notice-row"><span><strong>${esc(l.name)}</strong><code>${esc(l.path || l.id)}</code><small>${t(l.initialized ? "folderReady" : "folderPending")}</small>${owner ? `<details><summary>${t("folderMarker")}</summary><pre>${esc(l.marker)}</pre><p>${t("initializeHelp")}</p></details>` : ""}</span>${owner ? button("initialize", "initializeLocation", l.id) : ""}</article>`,
          )
          .join("") || `<p>${t("noEntries")}</p>`,
        "connections " + (role === "source" ? "sources" : "destinations"),
      );
    html += card(
      "newTransport",
      `<p class="help-copy">${t("transportHelp")}</p>${owner ? button("plan", "newTransport") : ""}${tr.plans.map((p) => `<article class="control-item"><h3>${esc(p.name)}</h3><p>${esc(p.sourceId)} → ${esc(p.destinationId)} · ${t(p.format === "protected" ? "protectedFormat" : "readableFormat")} · ${esc(p.enabled ? t("daily", { time: p.time }) : t("disabled"))}</p><div class="actions">${can("run", p.id) ? (p.format === "protected" ? `${owner && !p.initialized ? button("init", "initArchive", p.id) : ""}${button("backup", "startBackup", p.id)}${button("check", "verify", p.id)}${button("snapshots", "snapshots", p.id)}` : `${button("preview", "simulate", p.id)}${button("copy", "copyNow", p.id)}${button("verify", "verify", p.id)}`) : ""}${can("restore", p.id) ? button(p.format === "protected" ? "restore-protected" : "browse", p.format === "protected" ? "recover" : "browse", p.id) : ""}${can("configure", p.id) ? button("edit-plan", "configure", p.id) : ""}</div></article>`).join("") || `<p>${t("noEntries")}</p>`}`,
      "backups protected recovery",
    );
    html += card(
      "remoteHistory",
      tr.runs
        .map(
          (r) =>
            `<div class="notice-row"><span>${esc(r.name)} · ${esc(r.mode)}<small>${esc(r.finishedAt || r.queuedAt)}</small></span><span class="badge ${esc(r.status)}">${esc(t(r.status))}</span>${button("result", "details", r.id)}</div>`,
        )
        .join("") || `<p>${t("noEntries")}</p>`,
      "activity",
    );
    html += card(
      "accessNav",
      `<p>${t("accessHelp")}</p><a href="/guide/${language()}/access">${t("permissionsGuide")}</a>${
        owner
          ? `<div class="actions">${button("invite", "inviteUser")}</div>${a.users.map((u) => `<div class="notice-row"><span>${esc(u.name)} · ${esc(u.role)} · ${u.disabled ? t("disabled") : t("connected")}</span>${button("permissions", "configure", u.id)}${!u.disabled ? button("disable", "disableUser", u.id) : ""}</div>`).join("")}${a.invitations
              .filter((i) => !i.used && !i.revoked)
              .map(
                (i) =>
                  `<div class="notice-row"><span>${esc(i.name)} · ${new Date(i.expires).toLocaleDateString(language())}</span>${button("revoke-invitation", "revoke", i.id)}</div>`,
              )
              .join("")}`
          : `<p>${esc(a.principal.role)}</p>`
      }${(a.proposals || []).map((p) => `<div class="notice-row"><span>${esc(p.draft.name)} · ${esc(p.status)}</span>${owner && p.status === "pending" ? button("review", "reviewProposal", p.id) : ""}</div>`).join("")}${owner ? `<details><summary>Audit</summary><pre>${esc(JSON.stringify(a.audit, null, 2))}</pre></details>` : ""}`,
      "access",
    );
    const tokenRows = owner
      ? a.tokens
          .map(
            (v) =>
              `<div class="notice-row"><span>${esc(v.name)} · ${esc(v.channel)} · ${esc(v.scopes.join(", "))}<small>${new Date(v.expires).toLocaleString(language())} · ${v.revoked ? t("revoke") : t("connected")}</small></span>${!v.revoked ? button("revoke-token", "revoke", v.id) : ""}</div>`,
          )
          .join("")
      : "";
    html += card(
      "apiNav",
      `<p>${t("apiHelp")}</p><p>${t("tokenDisabled")}</p><a href="/guide/${language()}/agents">${t("apiGuide")}</a>${owner ? button("token", "createToken") : ""}${tokenRows}<pre>GET /api/v1/catalog\nGET /api/v1/status\nPOST /api/v1/run\nPOST /api/v1/proposals\nAuthorization: Bearer …\nIdempotency-Key: unique-request-id</pre>`,
      "api",
    );
    html += card(
      "mcpNav",
      `<p>${t("mcpHelp")}</p><a href="/guide/${language()}/agents">${t("apiGuide")}</a>${owner ? button("token", "createToken") : ""}<pre>[mcp_servers.backup_impresa]\nurl = "${esc(location.origin)}/mcp"\nbearer_token_env_var = "BACKUP_IMPRESA_MCP_TOKEN"</pre><p>backup_catalog · backup_status · backup_run · backup_propose</p>`,
      "mcp",
    );
    const catalog = [
      ...state.jobs.map((p) => ["legacy:" + p.id, p.name]),
      ...state.control.tasks.map((p) => ["control:" + p.id, p.name]),
      ...tr.plans.map((p) => ["transport:" + p.id, p.name]),
      ...tr.locations.map((l) => ["location:" + l.id, l.name]),
    ];
    html += card(
      "catalog",
      `<p>${t("resourceHelp")}</p><pre>${esc(catalog.map(([id, name]) => id + " — " + name).join("\n") || t("noEntries"))}</pre>`,
      "access api mcp",
    );
    root.innerHTML = html;
    document.dispatchEvent(new Event("backup-control-rendered"));
  };
}
