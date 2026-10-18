import {guideForm} from '/wizard.js';
import { translate, localeFor } from "/i18n.js";
export function mountControl({ api, refresh, message, language }) {
  const root = document.querySelector("#control-panel");
  let state,
    sources = [],
    pendingSnapshots;
  const t = (k, v) => translate(language(), k, v),
    esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const dialog = document.createElement("dialog");
  dialog.id = "control-dialog";
  document.body.append(dialog);
  const info = document.createElement("dialog");
  info.id = "control-info";
  document.body.append(info);
  function show(value) {
    info.innerHTML = `<div class="section-head"><h2>${t("controlDetails")}</h2><button class="ghost" data-info-close>${t("close")}</button></div><pre></pre>`;
    info.querySelector("pre").textContent =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    info.showModal();
  }
  info.addEventListener("click", async (e) => {
    if (e.target.closest("[data-info-close]")) info.close();
    const b = e.target.closest("[data-snapshot-restore]");
    if (b && confirm(t("restoreConfirm"))) {
      try {
        await api("/api/control/run", {
          repositoryId: b.dataset.repo,
          mode: "restore",
          snapshot: b.dataset.snapshotRestore,
        });
        info.close();
        message(t("queued"));
        await refresh();
      } catch (error) {
        message(error.message, true);
      }
    }
  });
  const option = (value, label, selected) =>
    `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;
  function field(name, label, value = "", type = "text", help = "") {
    return `<label>${esc(t(label))}<input name="${name}" type="${type}" value="${esc(value)}" ${["id", "name"].includes(name) ? "required" : ""} ${name === "id" ? 'pattern="[a-z][a-z0-9-]{0,39}"' : ""} autocomplete="${type === "password" ? "new-password" : "off"}">${help ? `<small>${esc(t(help))}</small>` : ""}</label>`;
  }
  function select(name, label, options, value) {
    return `<label>${esc(t(label))}<select name="${name}">${options.map(([v, l]) => option(v, l, value)).join("")}</select></label>`;
  }
  const check = (name, label, checked = false) =>
    `<label class="check"><input name="${name}" type="checkbox" ${checked ? "checked" : ""}>${esc(t(label))}</label>`;
  function edit(kind, old = {}) {
    let html = `<div class="section-head"><h2>${t("control" + kind)}</h2><button type="button" class="ghost" data-control-close>${t("close")}</button></div>`;
    if (kind !== "Settings")
      html +=
        field("id", "controlId", old.id) + field("name", "name", old.name);
    if (kind === "Servers")
      html +=
        `<p class="muted">${t("serverWizard")}</p>` +
        field("host", "serverHost", old.host) +
        field("port", "serverPort", old.port || 22, "number") +
        field("user", "serverUser", old.user || "backup") +
        field(
          "root",
          "serverFolder",
          old.root || "/backups/impresa-native",
          "text",
          "serverFolderHelp",
        ) +
        `<button class="ghost" type="button" data-scan>${t("scanHost")}</button><p data-fingerprint class="muted"></p><label>${t("serverHostKey")}<textarea name="hostKey" rows="3" spellcheck="false">${esc(old.hostKey || "")}</textarea></label>` +
        check("hostKeyVerified", "hostVerified", Boolean(old.hostKey)) +
        `<button class="ghost" type="button" data-generate>${t("generateKey")}</button><label>${t("privateKey")}<textarea name="privateKey" rows="3" spellcheck="false" autocomplete="off" placeholder="${esc(t("secretUnchanged"))}"></textarea></label><p class="muted">${t("keyHelp")}</p><pre data-public-key hidden></pre>`;
    if (kind === "Repositories")
      html +=
        select(
          "type",
          "repositoryType",
          [
            ["local", t("localRepository")],
            ["sftp", "SFTP / SSH"],
          ],
          old.type || "local",
        ) +
        `<p class="muted">${t("repositoryLocationHelp")} ${esc(state.repositoryRoot)}</p>` +
        select(
          "serverId",
          "controlServers",
          state.servers.map((s) => [s.id, s.name]),
          old.serverId,
        ) +
        field(
          "path",
          "remoteRepositoryPath",
          old.path?.startsWith(state.repositoryRoot)
            ? ""
            : old.path || "/backups/restic",
        ) +
        field(
          "password",
          "repositoryPassword",
          "",
          "password",
          "passwordRecoveryHelp",
        ) +
        field("keepDaily", "keepDaily", old.keepDaily ?? 7, "number") +
        field("keepWeekly", "keepWeekly", old.keepWeekly ?? 4, "number") +
        field("keepMonthly", "keepMonthly", old.keepMonthly ?? 0, "number") +
        check("managed", "managedRepository", old.managed) +
        `<p class="warning">${t("managedWarning")}</p>`;
    if (kind === "Tasks")
      html +=
        select(
          "type",
          "taskType",
          [
            ["pull", t("pullTask")],
            ["restic", t("resticTask")],
          ],
          old.type || "pull",
        ) +
        select(
          "serverId",
          "controlServers",
          state.servers.map((s) => [s.id, s.name]),
          old.serverId,
        ) +
        select(
          "profile",
          "pullProfile",
          [
            ["oracle", t("oracleProfile")],
            ["files", t("filesProfile")],
          ],
          old.profile || "oracle",
        ) +
        field(
          "maxBackupAgeHours",
          "backupMaxAge",
          old.maxBackupAgeHours ?? 30,
          "number",
          "backupAgeHelp",
        ) +
        check(
          "requireSites",
          "requireSiteBackups",
          old.requireSites !== false,
        ) +
        check(
          "requireDocker",
          "requireDockerBackups",
          old.requireDocker !== false,
        ) +
        select(
          "repositoryId",
          "controlRepositories",
          state.repositories.map((r) => [r.id, r.name]),
          old.repositoryId,
        ) +
        select(
          "sourceId",
          "source",
          [
            ...sources
              .filter((s) => !s.id.startsWith("remote:"))
              .map((s) => [s.id, s.name]),
            ...state.tasks
              .filter((t) => t.type === "pull")
              .map((s) => ["remote:" + s.id, s.name + " · SSH"]),
          ],
          old.sourceId,
        ) +
        `<p data-download-target class="warning">${t("stagingLocation")}: <code>${esc(state.staging)}</code></p>` +
        field("time", "dailyAt", old.time || "06:30", "time") +
        check("enabled", "enableCopy", old.enabled) +
        check("verifyEnabled", "enableVerify", old.verifyEnabled) +
        select(
          "verifyDay",
          "verifyDay",
          Array.from({ length: 7 }, (_, i) => [
            String(i),
            new Intl.DateTimeFormat(localeFor(language()), {
              weekday: "long",
              timeZone: "UTC",
            }).format(new Date(Date.UTC(2026, 0, 4 + i))),
          ]),
          String(old.verifyDay ?? 0),
        ) +
        field("verifyTime", "verifyAt", old.verifyTime || "12:30", "time") +
        `<p class="warning">${t("taskHelp")}</p>`;
    if (kind === "Settings") {
      html +=
        `<h3>Email</h3>` +
        field("SMTP_HOST", "smtpHost", old.SMTP_HOST) +
        field("SMTP_PORT", "smtpPort", old.SMTP_PORT || "587") +
        field("SMTP_USER", "username", old.SMTP_USER) +
        field("SMTP_PASSWORD", "password", "", "password", "secretUnchanged") +
        field("SMTP_FROM", "mailFrom", old.SMTP_FROM) +
        field("MAIL_TO", "mailTo", old.MAIL_TO) +
        `<h3>Telegram</h3>` +
        field(
          "TELEGRAM_BOT_TOKEN",
          "botToken",
          "",
          "password",
          "secretUnchanged",
        ) +
        field("TELEGRAM_CHAT_ID", "chatId", old.TELEGRAM_CHAT_ID) +
        `<h3>n8n / Webhook</h3>` +
        field(
          "RESULT_WEBHOOK_URL",
          "webhookUrl",
          old.RESULT_WEBHOOK_URL,
          "url",
        ) +
        field(
          "RESULT_WEBHOOK_TOKEN",
          "webhookToken",
          "",
          "password",
          "secretUnchanged",
        ) +
        field(
          "INBOUND_TASK_IDS",
          "inboundTasks",
          old.INBOUND_TASK_IDS,
          "text",
          "inboundHelp",
        ) +
        select(
          "NOTIFICATION_LANGUAGE",
          "language",
          [
            ["en", "English"],
            ["it", "Italiano"],
            ["es", "Español"],
          ],
          old.NOTIFICATION_LANGUAGE || language(),
        ) +
        select(
          "NOTIFY_SUCCESS",
          "successNotifications",
          [
            ["false", t("errorsOnly")],
            ["true", t("allResults")],
          ],
          old.NOTIFY_SUCCESS || "false",
        ) +
        `<p class="muted">${t("monitorHelp")}</p>`;
    }
    dialog.innerHTML = `<form data-kind="${kind}">${html}<button class="primary" type="submit">${t("saveConfiguration")}</button><p data-form-error class="error" role="alert"></p></form>`;
    if (old.id) dialog.querySelector("[name=id]").readOnly = true;
    if (kind === 'Servers') for (const name of ['host','port','user','root','hostKey','hostKeyVerified']) dialog.querySelector(`[name=${name}]`).required = true;
    function conditional() {
      const f = dialog.querySelector("form");
      if (kind === "Tasks") {
        for (const name of [
          "maxBackupAgeHours",
          "requireSites",
          "requireDocker",
        ])
          f.elements[name].closest("label").hidden =
            f.elements.type.value !== "pull" ||
            f.elements.profile.value !== "oracle";
        for (const name of ["serverId", "profile"])
          f.elements[name].closest("label").hidden =
            f.elements.type.value !== "pull";
        f.querySelector("[data-download-target]").hidden = f.elements.type.value !== "pull";
        for (const name of ["repositoryId", "sourceId"])
          f.elements[name].closest("label").hidden =
            f.elements.type.value !== "restic";
      }
      if (kind === "Repositories")
        for (const name of ["serverId", "path"])
          f.elements[name].closest("label").hidden =
            f.elements.type.value !== "sftp";
    }
    dialog
      .querySelector("[name=type]")
      ?.addEventListener("change", conditional);
    dialog
      .querySelector("[name=profile]")
      ?.addEventListener("change", conditional);
    conditional();
    if (kind !== 'Settings') {
      const groups = kind === 'Servers' ? [
        {title:'connectionStep',fields:['id','name','host','port','user','root']},
        {title:'trustStep',fields:['hostKey','hostKeyVerified','[data-scan]','[data-fingerprint]']},
        {title:'accessStep',fields:['privateKey','[data-generate]','[data-public-key]']},
      ] : kind === 'Repositories' ? [
        {title:'archiveStep',fields:['id','name','type','serverId','path','password']},
        {title:'retentionStep',fields:['keepDaily','keepWeekly','keepMonthly','managed','.warning']},
      ] : [
        {title:'sourceStep',fields:['id','name','type','serverId','profile','sourceId','maxBackupAgeHours','requireSites','requireDocker']},
        {title:'destinationStep',fields:['repositoryId','[data-download-target]']},
        {title:'scheduleStep',fields:['time','enabled','verifyEnabled','verifyDay','verifyTime','.warning']},
      ];
      guideForm(dialog.querySelector('form'),groups,t,{reviewHelp:kind==='Servers'?'saveSourceHelp':'reviewHelp'});
    }
    dialog.showModal();
  }
  dialog.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target,
      kind = f.dataset.kind,
      body = Object.fromEntries(new FormData(f));
    for (const name of [
      "enabled",
      "managed",
      "hostKeyVerified",
      "verifyEnabled",
      "requireSites",
      "requireDocker",
    ])
      body[name] = f.elements[name]?.checked === true;
    const route = {
      Servers: "server",
      Repositories: "repository",
      Tasks: "task",
      Settings: "settings",
    }[kind];
    try {
      await api("/api/control/" + route, body);
      f.reset();
      dialog.close();
      message(t("saved"));
      await refresh();
    } catch (error) {
      f.querySelector("[data-form-error]").textContent = error.message;
    }
  });
  dialog.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-control-close")) {
      dialog.querySelector("form").reset();
      dialog.close();
      return;
    }
    const f = dialog.querySelector("form");
    try {
      b.disabled = true;
      if (b.hasAttribute("data-scan")) {
        const r = await api("/api/control/scan", {
          host: f.host.value,
          port: f.port.value,
        });
        f.hostKey.value = r.hostKey;
        f.hostKeyVerified.checked = false;
        f.querySelector("[data-fingerprint]").textContent =
          r.fingerprint + " — " + t("compareFingerprint");
      }
      if (b.hasAttribute("data-generate")) {
        const r = await api("/api/control/key", { id: f.elements.id.value });
        const box = f.querySelector("[data-public-key]");
        box.hidden = false;
        box.textContent = r.publicKey;
      }
    } catch (error) {
      f.querySelector("[data-form-error]").textContent = error.message;
    } finally {
      b.disabled = false;
    }
  });
  const button = (action, id, label, extra = "") =>
    `<button class="ghost" data-control-action="${action}" data-control-id="${esc(id)}" ${extra}>${esc(t(label))}</button>`;
  document.addEventListener('backup-create',e=>{
    if(e.detail==='pull'&&!state.servers.length){message(t('missingSource'),true);return;}
    if(e.detail==='restic'&&!state.repositories.length){message(t('missingArchive'),true);return;}
    edit('Tasks',{type:e.detail});
  });
  root.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-control-action]");
    if (!b) return;
    const action = b.dataset.controlAction,
      id = b.dataset.controlId;
    try {
      b.disabled = true;
      if (action.startsWith("add")) return edit(action.slice(3));
      if (action.startsWith("edit")) {
        const kind = action.slice(4);
        return edit(
          kind,
          state[kind.toLowerCase()].find((s) => s.id === id),
        );
      }
      if (action === "settings") return edit("Settings", state.settings);
      if (action === "test")
        message(
          (await api("/api/control/test-server", { id })).ok
            ? t("connectionOk")
            : t("failed"),
        );
      if (action === "run-task") {
        const task = state.tasks.find((t) => t.id === id);
        await api("/api/control/run", {
          taskId: id,
          mode: task.type === "pull" ? "pull" : "backup",
        });
        message(t("queued"));
      }
      if (action === "verify-pull") {
        await api("/api/control/run", { taskId: id, mode: "verify-pull" });
        message(t("queued"));
      }
      if (
        ["init", "snapshots", "check", "retention-preview"].includes(action)
      ) {
        let confirmId;
        if (action === "init") {
          confirmId = prompt(t("initPrompt", { id }));
          if (confirmId !== id) return;
        }
        const response = await api("/api/control/run", {
          repositoryId: id,
          mode: action,
          confirm: confirmId,
        });
        if (action === "snapshots")
          pendingSnapshots = { runId: response.run.id, repositoryId: id };
        message(t("queued"));
      }
      if (action === "restore") {
        const snapshot = prompt(t("snapshotPrompt"));
        if (!snapshot) return;
        if (!confirm(t("restoreConfirm"))) return;
        await api("/api/control/run", {
          repositoryId: id,
          mode: "restore",
          snapshot: snapshot.trim(),
        });
        message(t("queued"));
      }
      if (action === "retention-apply") {
        const repo = state.repositories.find((r) => r.id === id),
          confirmId = prompt(t("retentionPrompt", { id }));
        if (confirmId !== id) return;
        await api("/api/control/run", {
          repositoryId: id,
          mode: "retention-apply",
          confirm: confirmId,
          planToken: repo.retentionPlan?.token,
        });
        message(t("queued"));
      }
      if (action === "details") show(state.runs.find((r) => r.id === id));
      if (action === "deliveries") show(state.deliveries);
      if (action === "token") {
        if (!confirm(t("tokenWarning"))) return;
        const r = await api("/api/control/token", { confirm: "rotate" });
        show(t("tokenOnce") + "\n\n" + r.token);
      }
      await refresh();
    } catch (error) {
      message(error.message, true);
    } finally {
      b.disabled = false;
    }
  });
  return function render(next, available) {
    if (!next) return;
    state = next;
    sources = available;
    if (pendingSnapshots) {
      const run = state.runs.find((r) => r.id === pendingSnapshots.runId);
      if (run?.status === "success") {
        info.innerHTML =
          `<div class="section-head"><h2>${t("listSnapshots")}</h2><button class="ghost" data-info-close>${t("close")}</button></div>` +
          run.result.snapshots
            .map(
              (s) =>
                `<article class="control-item"><strong>${esc(new Date(s.time).toLocaleString(localeFor(language())))}</strong><p>${esc((s.tags || []).join(", "))}</p><button class="primary" data-snapshot-restore="${esc(s.id)}" data-repo="${esc(pendingSnapshots.repositoryId)}">${t("recover")}</button></article>`,
            )
            .join("");
        pendingSnapshots = null;
        if (!info.open) info.showModal();
      } else if (run?.status === "failed") pendingSnapshots = null;
    }
    root.innerHTML = `<div class="section-head" data-pages="notifications"><div><h2>${t("controlTitle")}</h2><p>${t("controlHelp")}</p></div>${button("settings", "", "controlSettings")}</div>
    <div data-pages="destinations">${state.storage.some((s) => s.internal) ? `<p class="warning">${t("internalStorageWarning")}</p>` : ""}${state.storage
      .filter((s) => !s.online)
      .map((s) => `<p class="warning">${esc(s.kind)}: ${esc(s.error)}</p>`)
      .join("")}
    </div><div class="control-grid"><section class="card" data-pages="sources"><div class="section-head"><h3>${t("controlServers")}</h3>${button("addServers", "", "addServer")}</div><p>${t("serverSummary")}</p>${state.servers.map((s) => `<article class="control-item"><strong>${esc(s.name)}</strong><p class="muted">${esc(s.user)}@${esc(s.host)}:${s.port}</p>${button("test", s.id, "testConnection")}${button("editServers", s.id, "configure")}</article>`).join("") || `<p class="empty">${t("noServers")}</p>`}</section>
    <section class="card" data-pages="protected"><div class="section-head"><h3>${t("controlRepositories")}</h3>${button("addRepositories", "", "addRepository")}</div><p>${t("repositorySummary")}</p>${state.repositories.map((r) => `<article class="control-item"><strong>${esc(r.name)}</strong><p class="muted">${esc(r.type)} · ${t(r.managed ? "managedLabel" : "readOnlyLabel")}</p>${button("editRepositories", r.id, "configure")}${r.managed ? button("init", r.id, "initializeRepository") : ""}${button("snapshots", r.id, "listSnapshots")}${button("check", r.id, "checkRepository")}${button("restore", r.id, "restore")}${button("retention-preview", r.id, "retentionPreview")}${r.managed && r.retentionPlan?.ids.length ? button("retention-apply", r.id, "applyRetention") : ""}</article>`).join("") || `<p class="empty">${t("noRepositories")}</p>`}</section></div>
    <section class="card" data-pages="backups"><div class="section-head"><h3>${t("controlTasks")}</h3>${button("addTasks", "", "addTask")}</div><p>${t("taskSummary")}</p>${state.tasks.map((task) => `<article class="control-item"><strong>${esc(task.name)}</strong><p class="muted">${esc(task.id)} · ${t(task.type === "pull" ? "pullTask" : "resticTask")} · ${task.enabled ? esc(task.time) : t("disabled")}</p>${button("run-task", task.id, "runNow")}${task.type === "pull" ? button("verify-pull", task.id, "verify") : ""}${button("editTasks", task.id, "configure")}</article>`).join("") || `<p class="empty">${t("noControlTasks")}</p>`}<p class="muted">${t("stagingLocation")}: <code>${esc(state.staging)}</code></p></section>
    <section class="card" data-pages="notifications"><div class="section-head"><h3>${t("automationTitle")}</h3><div>${button("settings", "", "controlSettings")}${button("token", "", "rotateToken")}${button("deliveries", "", "deliveryHistory")}</div></div><p>${t("automationHelp")}</p><p class="muted">GET /api/integrations/status · POST /api/integrations/run</p></section>
    <section class="card" data-pages="activity"><h3>${t("controlHistory")}</h3>${
      state.runs
        .slice(0, 15)
        .map(
          (r) =>
            `<div class="notice-row"><span>${esc(r.name)} · ${esc(r.mode)} · ${esc(t(r.status))}<small> ${r.finishedAt ? esc(new Date(r.finishedAt).toLocaleString(localeFor(language()))) : ""}</small></span>${button("details", r.id, "details")}</div>`,
        )
        .join("") || `<p class="empty">${t("notRun")}</p>`
    }</section>
    ${state.tasks
      .filter((task) => task.profile === "oracle")
      .map((task) => {
        const r = state.runs.find(
          (r) =>
            r.taskId === task.id && r.status === "success" && r.result?.backups,
        );
        if (!r) return "";
        return `<section class="card" data-pages="sources"><h3>${esc(task.name)} · ${t("protectedServices")}</h3>${r.result.backups.map((b) => `<details><summary>${esc(b.path)}</summary><p>${t("sitesLabel")}: ${esc((b.domains || []).join(", ") || "—")}</p><p>Docker: ${esc((b.containers || []).join(", ") || "—")}</p><p>${t("checksumConfirmed")}</p></details>`).join("")}</section>`;
      })
      .join("")}`;
    document.dispatchEvent(new Event("backup-control-rendered"));
  };
}
