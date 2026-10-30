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

    /// The environment every spawned service starts from: KEY=VALUE pairs
    /// from `$GNOSIA_HOME/.env` (the local instance's settings, which no
    /// spawned process reads on its own — Next only loads files from
    /// apps/web, and the runner loads nothing) merged under the real
    /// environment so exports still win, then `CATALOG_DB` pinned at the
    /// data-home SQLite file when nothing names it. The pin is the default
    /// the catalog resolves anyway; making it explicit keeps a stale
    /// `DATABASE_URL` the shell happens to export from being read as a
    /// path.
    static func childEnv() -> [String: String] {
        var env = dataHomeEnv().merging(ProcessInfo.processInfo.environment) { _, own in own }
        if env["CATALOG_DB"]?.isEmpty != false {
            env["CATALOG_DB"] = dataHome().appending(path: "catalog.db").path
        }
        return env
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
