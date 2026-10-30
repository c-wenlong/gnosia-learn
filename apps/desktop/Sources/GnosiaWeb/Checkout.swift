//
//  Checkout.swift
//  GnosiaWeb
//
//  What every spawned process needs to know about the checkout it runs
//  from: where the repository is, where the local instance keeps its data
//  ($GNOSIA_HOME or ~/.gnosia), and the environment a child inherits.
//  WebServer and StudioRunner share this so the Next server and the studio
//  runner cannot end up pointed at two different databases by the same app.
//

import Foundation

enum Checkout {
    /// The repository root, found the way the other apps find it:
    /// `GNOSIA_REPO` wins, then the walk up from this file's compile-time
    /// path (`apps/desktop/Sources/GnosiaWeb` → root is five deletions).
    static func repoRoot() -> URL? {
        if let env = ProcessInfo.processInfo.environment["GNOSIA_REPO"], !env.isEmpty {
            return URL(fileURLWithPath: env)
        }
        // #filePath: <root>/apps/desktop/Sources/GnosiaWeb/Checkout.swift
        var here = URL(fileURLWithPath: #filePath)
        for _ in 0 ..< 5 { here.deleteLastPathComponent() }
        if FileManager.default.fileExists(atPath: here.appending(path: "apps/web").path) {
            return here
        }
        return nil
    }

    /// The data-home directory: `$GNOSIA_HOME` or `~/.gnosia`.
    static func dataHome() -> URL {
        if let home = ProcessInfo.processInfo.environment["GNOSIA_HOME"], !home.isEmpty {
            return URL(fileURLWithPath: home)
        }
        return FileManager.default.homeDirectoryForCurrentUser.appending(path: ".gnosia")
    }

    /// The environment every spawned service starts from (S9-08): the
    /// launchers' one rule, `services/sidecar/src/child-env.ts`, run once per
    /// launch by `prepare()`. It is the web's environment (exports, then
    /// `$GNOSIA_HOME/.env`, then apps/web's `.env` files) with `CATALOG_DB`
    /// pinned at the file the catalog's own resolver names, so a
    /// `DATABASE_URL` in services/catalog/.env reaches the web and the
    /// runner here exactly as it reaches the macOS app's sidecar and
    /// snapshot. Until `prepare()` has run, or when the resolver cannot
    /// (no node, a stripped checkout), `fallbackEnv()` stands in.
    static func childEnv() -> [String: String] {
        resolved.value ?? fallbackEnv()
    }

    private static let resolved = Resolved()

    /// The resolver's answer, read from any thread.
    private final class Resolved: @unchecked Sendable {
        private let lock = NSLock()
        private var env: [String: String]?
        var value: [String: String]? {
            get { lock.withLock { env } }
            set { lock.withLock { env = newValue } }
        }
    }

    /// Run the shared resolver, once, off the main thread. Every launcher
    /// awaits it before its first spawn; a second call reuses the answer.
    static func prepare() async {
        if resolved.value != nil { return }
        guard let root = repoRoot() else { return }
        let env = await Task.detached { runResolver(root: root) }.value
        if let env { resolved.value = env }
    }

    /// `node --import tsx services/sidecar/src/child-env.ts` through the
    /// login shell (so the owner's nvm/volta PATH and exports reach it),
    /// read as one JSON object of strings. Nil on any failure.
    private static func runResolver(root: URL) -> [String: String]? {
        guard FileManager.default.fileExists(atPath: root.appending(path: "services/sidecar/src/child-env.ts").path) else { return nil }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-lc", "exec node --import tsx services/sidecar/src/child-env.ts"]
        proc.currentDirectoryURL = root
        let out = Pipe()
        proc.standardOutput = out
        proc.standardError = FileHandle.nullDevice
        do { try proc.run() } catch { return nil }
        let data = out.fileHandleForReading.readDataToEndOfFile()
        proc.waitUntilExit()
        guard proc.terminationStatus == 0 else { return nil }
        return parseResolved(data)
    }

    /// The resolver's stdout: a JSON object whose values are all strings.
    /// The last non-empty line, since a login shell can print first.
    static func parseResolved(_ data: Data) -> [String: String]? {
        let text = String(decoding: data, as: UTF8.self)
        guard let line = text.split(whereSeparator: \.isNewline).last(where: { $0.hasPrefix("{") }),
              let object = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any]
        else { return nil }
        var env: [String: String] = [:]
        for (key, value) in object {
            guard let string = value as? String else { return nil }
            env[key] = string
        }
        return env
    }

    /// The environment before the resolver answers: `$GNOSIA_HOME/.env`
    /// under the real environment, and `CATALOG_DB` at the data home's file
    /// when nothing names it. The pin keeps a stale `DATABASE_URL` the
    /// shell exports from being read as a path; the resolver, which reads
    /// services/catalog/.env as the catalog does, replaces it.
    static func fallbackEnv() -> [String: String] {
        var env = dataHomeEnv().merging(ProcessInfo.processInfo.environment) { _, own in own }
        if env["CATALOG_DB"]?.isEmpty != false {
            env["CATALOG_DB"] = dataHome().appending(path: "catalog.db").path
        }
        return env
    }

    /// Whether the web serves the studio: `studioEnabled` in
    /// apps/web/src/lib/studio.ts, over the same environment the web gets.
    /// Anything non-empty but "0", "false", "off" or "no" enables it.
    static func studioEnabled(_ env: [String: String]) -> Bool {
        let value = (env["STUDIO_ENABLED"] ?? "").trimmingCharacters(in: .whitespaces).lowercased()
        return !["", "0", "false", "off", "no"].contains(value)
    }

    /// KEY=VALUE pairs from `$GNOSIA_HOME/.env` (default `~/.gnosia/.env`).
    static func dataHomeEnv() -> [String: String] {
        guard let text = try? String(contentsOfFile: dataHome().appending(path: ".env").path, encoding: .utf8) else { return [:] }
        return parseDotenv(text)
    }

    /// A dotenv file read as Node's `util.parseEnv` reads it, which is how
    /// the macOS app's sidecar reads this same file
    /// (services/sidecar/src/env.ts). The two must agree to the byte: the
    /// AUTH_SECRET read here seals the provider keys the web saves, and the
    /// sidecar opens them with its own read. Blanks and `#` lines skipped;
    /// an `export ` prefix dropped; a value in matching quotes is what the
    /// quotes hold, whatever follows them (a double-quoted `\n` is a
    /// newline); an unquoted value ends at its first `#`. Pinned by
    /// services/sidecar/test/fixtures/dotenv.json, which Node wrote.
    static func parseDotenv(_ text: String) -> [String: String] {
        var env: [String: String] = [:]
        for raw in text.split(omittingEmptySubsequences: true, whereSeparator: { $0 == "\n" || $0 == "\r\n" }) {
            var line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !line.isEmpty, !line.hasPrefix("#") else { continue }
            if line.hasPrefix("export ") {
                line = String(line.dropFirst("export ".count)).trimmingCharacters(in: .whitespaces)
            }
            guard let eq = line.firstIndex(of: "=") else { continue }
            let key = String(line[..<eq]).trimmingCharacters(in: .whitespaces)
            guard !key.isEmpty else { continue }
            let rest = String(line[line.index(after: eq)...]).trimmingCharacters(in: .whitespaces)
            env[key] = dotenvValue(rest)
        }
        return env
    }

    private static func dotenvValue(_ rest: String) -> String {
        if let quote = rest.first, quote == "\"" || quote == "'" || quote == "`" {
            let body = rest.dropFirst()
            if let close = body.firstIndex(of: quote) {
                let inside = String(body[..<close])
                return quote == "\"" ? inside.replacingOccurrences(of: "\\n", with: "\n") : inside
            }
        }
        let cut = rest.firstIndex(of: "#").map { String(rest[..<$0]) } ?? rest
        return cut.trimmingCharacters(in: .whitespaces)
    }
}
