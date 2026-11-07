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
    /// The repository root: `GNOSIA_REPO` wins (the bundle bakes it into
    /// its Info.plist's LSEnvironment), then the walk up from this file's compile-time
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
    /// launchers' one rule, `services/launch-env/src/child-env.ts`, run once per
    /// launch by `prepare()`. It is the web's environment (exports, then
    /// `$GNOSIA_HOME/.env`, then apps/web's `.env` files) with `CATALOG_DB`
    /// pinned at the file the catalog's own resolver names, so a
    /// `DATABASE_URL` in services/catalog/.env reaches the web and the
    /// runner here exactly as it reaches the catalog's own CLI. Until `prepare()` has run, or when the resolver cannot
    /// (no node, a stripped checkout), `fallbackEnv()` stands in.
    static func childEnv() -> [String: String] {
        state.resolved ?? fallbackEnv()
    }

    /// The command line a child runs under. With the resolved environment
    /// it is a plain `/bin/sh -c`: that environment already carries the
    /// login shell's PATH and exports, and a second login shell would read
    /// the profile again and put back a value the resolver rewrote (a
    /// relative `CATALOG_DB`, say). Without it, the login shell as before,
    /// so the owner's nvm/volta PATH still reaches node.
    static func shell(_ command: String) -> (executable: URL, arguments: [String]) {
        state.resolved == nil
            ? (URL(fileURLWithPath: "/bin/zsh"), ["-lc", command])
            : (URL(fileURLWithPath: "/bin/sh"), ["-c", command])
    }

    private static let state = ResolverState(run: { runResolver(root: $0) })

    /// Why the last resolver run failed, when it did: its exit and the tail
    /// of what it printed on stderr. Nil once a run has answered.
    static var resolverFailure: String? { state.failure }

    /// One resolver run's result: the environment, or why there is none.
    struct Resolution: Sendable {
        var env: [String: String]?
        var failure: String?
    }

    /// The resolver's answer and the one run that produces it, from any
    /// thread: every launcher awaits the same task, so a cold launch runs
    /// the login shell and node once, not once per launcher. Only an answer
    /// is kept. A failed run is forgotten, so the next `prepare()` (the
    /// window's "Try again") runs the resolver again rather than reusing
    /// the failure for the rest of the app's life.
    final class ResolverState: @unchecked Sendable {
        private let lock = NSLock()
        private let run: @Sendable (URL) -> Resolution
        private var answer: [String: String]?
        private var lastFailure: String?
        private var running: Task<Void, Never>?

        init(run: @escaping @Sendable (URL) -> Resolution) {
            self.run = run
        }

        var resolved: [String: String]? { lock.withLock { answer } }
        var failure: String? { lock.withLock { lastFailure } }

        /// The run in flight, a new one, or nil when there is an answer.
        func task(root: URL) -> Task<Void, Never>? {
            lock.withLock {
                if answer != nil { return nil }
                if let running { return running }
                // Created under the lock, so the task's own clean-up below
                // cannot run before `running` names it.
                let task = Task.detached {
                    let result = self.run(root)
                    self.lock.withLock {
                        self.answer = result.env
                        self.lastFailure = result.env == nil ? (result.failure ?? "the resolver gave no answer") : nil
                        self.running = nil
                    }
                }
                running = task
                return task
            }
        }

        func prepare(root: URL) async {
            await task(root: root)?.value
        }
    }

    /// Every launcher's one step before its first spawn: the access check,
    /// then the shared resolver, run once off the main thread. A later call
    /// reuses the answer, or runs it again after a failure. The answer is
    /// why the checkout cannot be read, when it cannot, and then nothing
    /// is spawned, the resolver included: it would hang on the same folder
    /// while macOS waits for the owner.
    @discardableResult
    static func prepare() async -> String? {
        guard let root = repoRoot() else { return nil }
        if let problem = await checkAccess(root) { return problem }
        await state.prepare(root: root)
        return nil
    }

    /// Whether the resolver has answered, so children get its environment
    /// rather than `fallbackEnv()`.
    static var isResolved: Bool { state.resolved != nil }

    /// How long the resolver may take before the launch goes on without it:
    /// a login profile that stalls must not hold the window on its spinner.
    static let resolverDeadline: TimeInterval = 20

    /// `node --import tsx services/launch-env/src/child-env.ts` through the
    /// login shell (so the owner's nvm/volta PATH and exports reach it),
    /// read as one JSON object of strings. `GNOSIA_WEB_MODE` reaches it from
    /// this process, so a `next start` launch reads the production `.env`
    /// files. No environment on any failure, or past `resolverDeadline`,
    /// with the reason and the tail of its stderr.
    fileprivate static func runResolver(root: URL) -> Resolution {
        let entry = root.appending(path: "services/launch-env/src/child-env.ts")
        guard FileManager.default.fileExists(atPath: entry.path) else {
            return Resolution(failure: "\(entry.path) is missing")
        }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-lc", "exec node --import tsx services/launch-env/src/child-env.ts"]
        proc.currentDirectoryURL = root
        let out = Pipe()
        let err = Pipe()
        proc.standardOutput = out
        proc.standardError = err
        do { try proc.run() } catch {
            return Resolution(failure: "the resolver could not start: \(error.localizedDescription)")
        }
        // stderr is read as it arrives, beside stdout, so a chatty stderr
        // cannot fill its pipe and stall the child, and what it printed is
        // kept even if something the login shell started holds it open.
        let errText = StderrCapture(pipe: err, limit: 1500)
        let stopped = Locked(false)
        // Past the deadline the child is stopped; its pipe then closes and
        // the read below ends.
        let deadline = DispatchWorkItem {
            if proc.isRunning {
                stopped.set(true)
                proc.terminate()
            }
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + resolverDeadline, execute: deadline)
        let data = out.fileHandleForReading.readDataToEndOfFile()
        proc.waitUntilExit()
        deadline.cancel()
        // Something the login shell started can hold stderr open; do not
        // wait on it for long.
        errText.waitClosed(timeout: 2)
        let tail = errText.tail
        func failed(_ why: String) -> Resolution {
            Resolution(failure: tail.isEmpty ? why : "\(why): \(tail)")
        }
        if stopped.get() {
            return failed("the resolver was stopped after \(Int(resolverDeadline)) s")
        }
        guard proc.terminationReason == .exit else {
            return failed("the resolver was killed by signal \(proc.terminationStatus)")
        }
        guard proc.terminationStatus == 0 else {
            return failed("the resolver exited with status \(proc.terminationStatus)")
        }
        guard let env = parseResolved(data) else { return failed("the resolver printed no environment") }
        return Resolution(env: env)
    }

    /// A value another thread fills in.
    private final class Locked<Value>: @unchecked Sendable {
        private let lock = NSLock()
        private var value: Value
        init(_ value: Value) { self.value = value }
        func set(_ new: Value) { lock.withLock { value = new } }
        func get() -> Value { lock.withLock { value } }
    }

    /// `text` as one word for `/bin/sh` and `zsh`: single-quoted, with each
    /// `'` closed, escaped and reopened, so a path holding a quote, a space
    /// or a `$` stays one literal argument.
    static func shellQuoted(_ text: String) -> String {
        "'" + text.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    /// Read a real file in the checkout from this process before any child
    /// is spawned. Under the checkout in Desktop, Documents or Downloads,
    /// macOS privacy protection asks the owner at this read, with the
    /// bundle's usage string, and a refusal is a message naming the path.
    /// Without it the children were refused instead, and hung with nothing
    /// on stderr. Off the main thread: the system prompt holds the read.
    static func checkAccess(_ root: URL) async -> String? {
        await Task.detached { accessProblem(root: root) }.value
    }

    /// Nil when `package.json` at the root reads, else why not.
    static func accessProblem(root: URL) -> String? {
        let file = root.appending(path: "package.json")
        do {
            _ = try Data(contentsOf: file)
            return nil
        } catch {
            return accessMessage(file: file, error: error)
        }
    }

    static func accessMessage(file: URL, error: Error) -> String {
        let ns = error as NSError
        let underlying = ns.userInfo[NSUnderlyingErrorKey] as? NSError
        let missing = (ns.domain == NSCocoaErrorDomain && ns.code == NSFileReadNoSuchFileError)
            || (underlying?.domain == NSPOSIXErrorDomain && underlying?.code == Int(ENOENT))
        if missing {
            return "There is no \(file.lastPathComponent) at \(file.deletingLastPathComponent().path). "
                + "GNOSIA_REPO may not name the repository root."
        }
        return "macOS did not let Gnosia Web read \(file.path) (\(ns.localizedDescription)). "
            + "Allow Gnosia Web in System Settings > Privacy & Security > Files and Folders, "
            + "or move the checkout out of Desktop, Documents and Downloads, then try again."
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
        let value = (env["STUDIO_ENABLED"] ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return !["", "0", "false", "off", "no"].contains(value)
    }

    /// KEY=VALUE pairs from `$GNOSIA_HOME/.env` (default `~/.gnosia/.env`).
    static func dataHomeEnv() -> [String: String] {
        guard let text = try? String(contentsOfFile: dataHome().appending(path: ".env").path, encoding: .utf8) else { return [:] }
        return parseDotenv(text)
    }

    /// A dotenv file read as Node's `util.parseEnv` reads it, which is how
    /// the launchers' resolver reads this same file
    /// (services/launch-env/src/env.ts). The two must agree to the byte:
    /// with no resolver, the AUTH_SECRET read here is the one the web seals
    /// the provider keys under. Blanks and `#` lines skipped;
    /// an `export ` prefix dropped; a value in matching quotes is what the
    /// quotes hold, whatever follows them (a double-quoted `\n` is a
    /// newline); an unquoted value ends at its first `#`. Pinned by
    /// services/launch-env/test/fixtures/dotenv.json, which Node wrote.
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
