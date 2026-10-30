//
//  CatalogSnapshot.swift
//  Gnosia
//
//  Keeps the mirror the app reads (<data home>/app-catalog.db) current
//  without a manual `node scripts/catalog-snapshot.mjs`: on launch and each
//  time the app comes to the front, the repo's script runs with
//  `--if-stale` through the same login shell the sidecar uses. The script
//  decides: it resolves the catalog file and the owner the way every
//  catalog command does, and rewrites the mirror only when it is missing,
//  of another format or owner, or older than the catalog or its WAL —
//  otherwise it prints `fresh`. The caller reloads the store when a new
//  file landed. A missing
//  repo or node, or a refused run, leaves whatever file was already there
//  and keeps what went wrong for Settings;
//  a bundled app with no checkout just keeps its last snapshot. The script
//  writes a `.partial` and renames it into place, so the target path never
//  holds a half-written database.
//

import Foundation

enum CatalogSnapshot {
    /// What a refresh came to.
    enum Outcome: Equatable {
        /// The mirror was already as new as the catalog; nothing ran.
        case fresh
        /// A new file landed: the store should reload.
        case refreshed
        /// The run could not start or exited nonzero: the old file stays,
        /// and this is what it said (its last stderr lines), for Settings.
        case failed(String)
    }

    /// Refreshes the mirror when it is stale. Every failure leaves the
    /// existing file alone and says why, rather than vanishing into
    /// /dev/null: a snapshot that cannot be taken is otherwise a stale
    /// library with nothing anywhere saying so.
    static func refreshIfNeeded(location: CatalogLocation) async -> Outcome {
        guard let root = repoRoot() else {
            return .failed("No checkout found to run the snapshot from; set GNOSIA_REPO to the repository root.")
        }
        let script = root.appending(path: "apps/macos/scripts/catalog-snapshot.mjs")
        guard FileManager.default.fileExists(atPath: script.path) else {
            return .failed("apps/macos/scripts/catalog-snapshot.mjs is not in \(root.path).")
        }

        // The launchers' shared environment (ChildEnvironment, S9-08): the
        // catalog file the web writes, pinned, so the script snapshots it.
        let env = await ChildEnvironment.resolve(root: root)
        // --out always names where the app reads, so a Settings override or
        // a GNOSIA_CATALOG env reaches the script the same way.
        return await withCheckedContinuation { done in
            let proc = Process()
            let stderr = Pipe()
            proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
            proc.arguments = [
                "-lc",
                "node apps/macos/scripts/catalog-snapshot.mjs --if-stale --out '\(location.catalogPath)'"
            ]
            proc.currentDirectoryURL = root
            if let env { proc.environment = env }
            let stdout = Pipe()
            proc.standardOutput = stdout
            proc.standardError = stderr
            // stderr is drained while the script runs, so a chatty run never
            // fills the pipe and blocks before it can exit.
            let drained = DispatchGroup()
            let said = SaidBox()
            let printed = SaidBox()
            proc.terminationHandler = { p in
                drained.wait()
                done.resume(returning: outcome(status: p.terminationStatus, stdout: printed.text, stderr: said.text))
            }
            // Entered before the run, so a script that exits at once still
            // finds the reads pending rather than an empty group.
            drained.enter()
            DispatchQueue.global().async {
                said.text = String(decoding: stderr.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                drained.leave()
            }
            drained.enter()
            DispatchQueue.global().async {
                printed.text = String(decoding: stdout.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                drained.leave()
            }
            do {
                try proc.run()
            } catch {
                // No child holds the pipes: close our ends so the reads end.
                try? stderr.fileHandleForWriting.close()
                try? stdout.fileHandleForWriting.close()
                done.resume(returning: .failed("Could not start node: \(error.localizedDescription)"))
            }
        }
    }

    /// What the script wrote to stderr, handed from the reading queue to the
    /// termination handler (the group orders the two).
    private final class SaidBox: @unchecked Sendable {
        var text = ""
    }

    /// The last non-empty lines of what the script printed, short enough
    /// for a Settings row, or the exit status when it printed nothing.
    static func failureLine(_ stderr: String, status: Int32) -> String {
        let lines = stderr.split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard !lines.isEmpty else { return "The snapshot exited with status \(status)." }
        return String(lines.suffix(2).joined(separator: " ").prefix(400))
    }

    /// What a run came to: `fresh` on stdout is the script saying the
    /// mirror was current and nothing was written.
    static func outcome(status: Int32, stdout: String, stderr: String) -> Outcome {
        guard status == 0 else { return .failed(failureLine(stderr, status: status)) }
        // Any line, not the first: a login shell can print before the script does.
        let fresh = stdout.split(whereSeparator: \.isNewline).contains { $0.trimmingCharacters(in: .whitespaces) == "fresh" }
        return fresh ? .fresh : .refreshed
    }

    /// The same discovery SidecarManager uses: GNOSIA_REPO wins, then the
    /// walk up from this file's compile-time path.
    private static func repoRoot() -> URL? {
        if let env = ProcessInfo.processInfo.environment["GNOSIA_REPO"], !env.isEmpty {
            return URL(fileURLWithPath: env)
        }
        // #filePath: <root>/apps/macos/Sources/Gnosia/CatalogSnapshot.swift
        var here = URL(fileURLWithPath: #filePath)
        for _ in 0 ..< 5 { here.deleteLastPathComponent() }
        if FileManager.default.fileExists(atPath: here.appending(path: "services/sidecar").path) {
            return here
        }
        return nil
    }
}
