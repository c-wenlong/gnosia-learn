//
//  CatalogSnapshot.swift
//  Gnosia
//
//  Keeps the mirror the app reads (<data home>/app-catalog.db) current
//  without a manual `node scripts/catalog-snapshot.mjs`: on launch and each
//  time the app comes to the front, when the live catalog.db (or its WAL)
//  is newer than the mirror — or the mirror does not exist — the repo's
//  script is spawned through the same login shell the sidecar
//  uses, and the caller reloads the store when it exits cleanly. A missing
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
        guard isStale(location: location) else { return .fresh }
        guard let root = repoRoot() else {
            return .failed("No checkout found to run the snapshot from; set GNOSIA_REPO to the repository root.")
        }
        let script = root.appending(path: "apps/macos/scripts/catalog-snapshot.mjs")
        guard FileManager.default.fileExists(atPath: script.path) else {
            return .failed("apps/macos/scripts/catalog-snapshot.mjs is not in \(root.path).")
        }

        // --out always names where the app reads, so a Settings override or
        // a GNOSIA_CATALOG env reaches the script the same way.
        return await withCheckedContinuation { done in
            let proc = Process()
            let stderr = Pipe()
            proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
            proc.arguments = [
                "-lc",
                "node apps/macos/scripts/catalog-snapshot.mjs --out '\(location.catalogPath)'"
            ]
            proc.currentDirectoryURL = root
            proc.standardOutput = FileHandle.nullDevice
            proc.standardError = stderr
            // stderr is drained while the script runs, so a chatty run never
            // fills the pipe and blocks before it can exit.
            let drained = DispatchGroup()
            let said = SaidBox()
            proc.terminationHandler = { p in
                drained.wait()
                done.resume(returning: p.terminationStatus == 0
                    ? .refreshed
                    : .failed(failureLine(said.text, status: p.terminationStatus)))
            }
            // Entered before the run, so a script that exits at once still
            // finds the read pending rather than an empty group.
            drained.enter()
            DispatchQueue.global().async {
                said.text = String(decoding: stderr.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                drained.leave()
            }
            do {
                try proc.run()
            } catch {
                // No child holds the pipe: close our end so the read ends.
                try? stderr.fileHandleForWriting.close()
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

    /// The mirror is stale when the file the script would read is newer
    /// than it, or when there is no mirror at all — the run then decides
    /// whether it can find a source at all. A source the env names that is
    /// not a file (a postgres DATABASE_URL) can't be stat'ed for freshness;
    /// with a mirror already present the run is skipped rather than spawned
    /// blind every launch.
    private static func isStale(location: CatalogLocation) -> Bool {
        guard FileManager.default.fileExists(atPath: location.catalogPath) else { return true }
        let env = ProcessInfo.processInfo.environment
        let raw = env["CATALOG_DB"]?.trimmingCharacters(in: .whitespaces)
        let source = (raw?.isEmpty == false ? raw : nil)
            ?? CatalogLocation.dataHome(env: env).appendingPathComponent("catalog.db").path
        return isStale(mirror: location.catalogPath, source: source)
    }

    /// The comparison itself. The catalog runs in WAL mode, so a new row
    /// lands in `catalog.db-wal` and the main file's time moves only at a
    /// checkpoint, which a server holding the file open makes rarely: the
    /// source's time is the newer of the two files.
    static func isStale(mirror: String, source: String) -> Bool {
        guard let srcAt = modified(source), let dstAt = modified(mirror) else { return false }
        return max(srcAt, modified(source + "-wal") ?? .distantPast) > dstAt
    }

    private static func modified(_ path: String) -> Date? {
        (try? FileManager.default.attributesOfItem(atPath: path)[.modificationDate]) as? Date
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
