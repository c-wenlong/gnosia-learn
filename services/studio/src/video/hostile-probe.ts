/**
 * The hostile probe every Chrome tool's doctor and real-sandbox suite runs in
 * a job's render profile (D76 of docs/STUDIO-VIDEO-TOOLS.md), written in
 * JavaScript since node is what runs there: the owner's files, the network
 * beyond the job's two ports, other programs, a link out of the job, and a
 * socket on a port that is not the job's. Every line must say "blocked".
 *
 * Its one argument is a JSON object: `home`, `root` (the tool's real
 * checkout), `nodeModules`, `render` and `otherPort`.
 */

/** What a hostile scene's Node could try, as a program: each line prints whether it was blocked. */
export const HOSTILE_PROBE_JS = String.raw`
const fs = require("node:fs"), net = require("node:net"), path = require("node:path"), { spawnSync } = require("node:child_process"), dns = require("node:dns");
const T = JSON.parse(process.argv[1]);
const out = {};
const sync = (name, fn) => { try { fn(); out[name] = "allowed"; } catch (e) { out[name] = "blocked: " + (e.code || e.message); } };
const connect = (name, options) => new Promise((resolve) => {
  const socket = net.connect(options);
  const done = (verdict) => { out[name] = verdict; socket.destroy(); resolve(); };
  socket.setTimeout(3000, () => done("blocked: timeout"));
  socket.once("connect", () => done("allowed"));
  socket.once("error", (e) => done("blocked: " + e.code));
});
const listen = (name, port) => new Promise((resolve) => {
  const server = net.createServer();
  server.once("error", (e) => { out[name] = "blocked: " + e.code; resolve(); });
  server.listen(port, "127.0.0.1", () => { out[name] = "allowed"; server.close(() => resolve()); });
});
(async () => {
  sync("read home", () => fs.readdirSync(fs.existsSync(path.join(T.home, ".ssh")) ? path.join(T.home, ".ssh") : T.home));
  sync("read ~/.claude.json", () => fs.readFileSync(path.join(T.home, ".claude.json")));
  sync("write in home", () => { const p = path.join(T.home, ".studio-sandbox-probe-" + process.pid); fs.writeFileSync(p, "x", { flag: "wx" }); fs.rmSync(p); });
  sync("write in the real checkout", () => { const p = path.join(T.root, "sandbox-probe-" + process.pid); fs.writeFileSync(p, "x", { flag: "wx" }); fs.rmSync(p); });
  sync("write in node_modules", () => { const p = path.join(T.nodeModules, ".sandbox-probe-" + process.pid); fs.writeFileSync(p, "x", { flag: "wx" }); fs.rmSync(p); });
  sync("list /private/tmp", () => fs.readdirSync("/private/tmp"));
  sync("symlink out of render", () => { const p = path.join(T.render, "probe-link-" + process.pid); fs.symlinkSync("/etc/hosts", p); fs.rmSync(p); });
  sync("hard link in render", () => { const a = path.join(T.render, "probe-a-" + process.pid); fs.writeFileSync(a, "x"); try { fs.linkSync(a, a + "-b"); fs.rmSync(a + "-b"); } finally { fs.rmSync(a); } });
  sync("run curl", () => { const r = spawnSync("/usr/bin/curl", ["--version"]); if (r.error) throw r.error; if (r.status !== 0) throw new Error("exit " + r.status); });
  sync("run open", () => { const r = spawnSync("/usr/bin/open", ["-h"]); if (r.error) throw r.error; if (r.status !== 0 && r.status !== 1) throw new Error("exit " + r.status); });
  sync("run python", () => { const r = spawnSync("/usr/bin/python3", ["-c", "1"]); if (r.error) throw r.error; if (r.status !== 0) throw new Error("exit " + r.status); });
  await connect("tcp 1.1.1.1:443", { host: "1.1.1.1", port: 443 });
  await connect("tcp 127.0.0.1:5432", { host: "127.0.0.1", port: 5432 });
  await connect("tcp the studio runner 127.0.0.1:7250", { host: "127.0.0.1", port: 7250 });
  await connect("postgres unix socket", { path: "/tmp/.s.PGSQL.5432" });
  await listen("listen on a port that is not the job's", T.otherPort);
  await new Promise((resolve) => dns.lookup("example.com", (e) => { out["dns example.com"] = e ? "blocked: " + e.code : "allowed"; resolve(); }));
  out["secrets in env"] = Object.keys(process.env).some((k) => /KEY|TOKEN|SECRET|PASSWORD/i.test(k)) ? "allowed" : "blocked";
  process.stdout.write(JSON.stringify(out) + "\n");
})();
`;
