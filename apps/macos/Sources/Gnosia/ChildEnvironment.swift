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
    private static let state = State()

    /// The answer and the one run that produces it: every caller awaits the
    /// same task, so the login shell and node run once per app launch.
    private final class State: @unchecked Sendable {
        private let lock = NSLock()
        private var running: Task<[String: String]?, Never>?

        func task(root: URL) -> Task<[String: String]?, Never> {
            lock.withLock {
                if let running { return running }
                let task = Task.detached { ChildEnvironment.run(root: root) }
                running = task
                return task
            }
        }
    }

    /// The resolved environment for a checkout, computed on first use.
    static func resolve(root: URL) async -> [String: String]? {
        await state.task(root: root).value
    }

    /// The command line a child runs under, given what `resolve` answered.
    /// With an environment, a plain `/bin/sh -c`: it already carries the
    /// login shell's PATH and exports, and a second login shell would read
    /// the profile again and put back a value the resolver rewrote. Without
    /// one, the login shell, so the owner's nvm/volta PATH reaches node.
    static func shell(_ command: String, env: [String: String]?) -> (executable: URL, arguments: [String]) {
        env == nil
            ? (URL(fileURLWithPath: "/bin/zsh"), ["-lc", command])
            : (URL(fileURLWithPath: "/bin/sh"), ["-c", command])
    }

    /// How long the resolver may take before the caller goes on without it.
    static let deadline: TimeInterval = 20

    fileprivate static func run(root: URL) -> [String: String]? {
        guard FileManager.default.fileExists(atPath: root.appending(path: "services/sidecar/src/child-env.ts").path) else { return nil }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-lc", "exec node --import tsx services/sidecar/src/child-env.ts"]
        proc.currentDirectoryURL = root
        let out = Pipe()
        proc.standardOutput = out
        proc.standardError = FileHandle.nullDevice
        do { try proc.run() } catch { return nil }
        // Past the deadline the child is stopped; its pipe closes and the read ends.
        let stop = DispatchWorkItem { if proc.isRunning { proc.terminate() } }
        DispatchQueue.global().asyncAfter(deadline: .now() + deadline, execute: stop)
        let data = out.fileHandleForReading.readDataToEndOfFile()
        proc.waitUntilExit()
        stop.cancel()
        guard proc.terminationReason == .exit, proc.terminationStatus == 0 else { return nil }
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
