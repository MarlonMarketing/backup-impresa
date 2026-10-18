// Disposable localhost UI/MCP fixture. Never deploy or use this account in production.
import fs from "node:fs";
import path from "node:path";
import { createApplication, passwordHash } from "../server.mjs";
const root = "/tmp/backup-impresa-preview";
fs.mkdirSync(root, { recursive: true });
for (const d of ["source", "destination", "restore"])
  fs.mkdirSync(path.join(root, d), { recursive: true });
const app = createApplication({
  quiet: true,
  sources: [],
  env: {
    DATA_DIR: path.join(root, "data"),
    TARGET_ROOT: path.join(root, "destination"),
    RESTORE_ROOT: path.join(root, "restore"),
    LOCAL_CONNECTOR_ROOTS: JSON.stringify([root]),
    MIN_FREE_GB: "0",
    PILOT_MODE: "true",
  },
  notifier: { send: async () => {}, channels: () => ({ last: {} }) },
});
app.store.state.admin = {
  username: "test-owner",
  password: passwordHash("disposable-preview-password"),
};
app.store.save();
const tr = app.gateway.transports;
if (!tr.state.connections.length) {
  tr.saveConnection({
    id: "test-disk",
    name: "Disco dimostrativo",
    type: "local",
  });
  for (const [id, role] of [
    ["source", "source"],
    ["destination", "destination"],
  ]) {
    tr.saveLocation({
      id,
      name: id,
      role,
      path: path.join(root, id),
      connectionId: "test-disk",
    });
    await tr.initializeLocation(id, id);
  }
  tr.savePlan({
    id: "test-photos",
    name: "Foto dimostrative",
    sourceId: "source",
    destinationId: "destination",
  });
}
fs.writeFileSync(path.join(root,"destination/.backup-impresa-target"),"impresa-usb-v1");
const credential = app.gateway.access.issue(app.gateway.access.owner(), {
  name: "Disposable MCP test",
  channel: "mcp",
  scopes: ["read"],
  resources: ["transport:test-photos"],
  days: 1,
});
fs.writeFileSync("/tmp/preview-mcp-token", credential.token, { mode: 0o600 });
app.server.listen(9899, "0.0.0.0");
