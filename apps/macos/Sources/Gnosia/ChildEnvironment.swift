//
//  ChildEnvironment.swift
//  Gnosia
//
//  The environment the app hands the studio runner and the snapshot script
//  (S9-08): the launchers' one rule, services/sidecar/src/child-env.ts, the
//  same one the desktop shell's Checkout runs. It is the web's environment
//  (exports, then $GNOSIA_HOME/.env, then apps/web's .env files) with
//  CATALOG_DB pinned at the file the catalog's own resolver names, so a
//  runner this app starts gets the owner's spend cap and owner, and the
//  snapshot reads the file the web writes. The sidecar runs the same code
//  in its own process (`loadSidecarEnv` then `pinCatalogFile`).
//
//  Run once per app launch, off the main thread; nil when it cannot run
//  (no node, a stripped checkout), and the caller falls back to the
//  process's own environment as before.
//

import Foundation

enum ChildEnvironment {
    private static let cache = Cache()

    private final class Cache: @unchecked Sendable {
        private let lock = NSLock()
        private var env: [String: String]?
        var value: [String: String]? {
            get { lock.withLock { env } }
            set { lock.withLock { env = newValue } }
        }
    }

    /// The resolved environment for a checkout, computed on first use.
    static func resolve(root: URL) async -> [String: String]? {
        if let env = cache.value { return env }
        let env = await Task.detached { run(root: root) }.value
        if let env { cache.value = env }
        return env
    }

    private static func run(root: URL) -> [String: String]? {
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
        return parse(data)
    }

    /// The resolver's stdout: one JSON object of strings, on the last line
    /// that opens one (a login shell can print before it).
    static func parse(_ data: Data) -> [String: String]? {
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
}
