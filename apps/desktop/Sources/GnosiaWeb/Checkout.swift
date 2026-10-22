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
    /// Blanks and `#` comments skipped; quotes around a value are stripped.
    static func dataHomeEnv() -> [String: String] {
        guard let text = try? String(contentsOfFile: dataHome().appending(path: ".env").path, encoding: .utf8) else { return [:] }
        var env: [String: String] = [:]
        for line in text.split(separator: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.isEmpty, !trimmed.hasPrefix("#"),
                  let eq = trimmed.firstIndex(of: "=") else { continue }
            let key = String(trimmed[..<eq]).trimmingCharacters(in: .whitespaces)
            var value = String(trimmed[trimmed.index(after: eq)...]).trimmingCharacters(in: .whitespaces)
            // dotenv rules: matching single or double quotes come off
            // wholesale; an unquoted value ends at ` #`.
            if value.count >= 2,
               (value.hasPrefix("\"") && value.hasSuffix("\"")) ||
               (value.hasPrefix("'") && value.hasSuffix("'")) {
                value = String(value.dropFirst().dropLast())
            } else if let hash = value.range(of: " #") {
                value = String(value[..<hash.lowerBound]).trimmingCharacters(in: .whitespaces)
            }
            if !key.isEmpty { env[key] = value }
        }
        return env
    }
}
