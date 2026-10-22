//
//  CatalogSnapshot.swift
//  Gnosia
//
//  Keeps the mirror the app reads (<data home>/app-catalog.db) current
//  without a manual `node scripts/catalog-snapshot.mjs`: on launch, when the
//  live catalog.db is newer than the mirror — or the mirror does not exist
//  — the repo's script is spawned through the same login shell the sidecar
//  uses, and the caller reloads the store when it exits cleanly. A missing
//  repo or node, or a refused run, leaves whatever file was already there;
//  a bundled app with no checkout just keeps its last snapshot. The script
//  writes a `.partial` and renames it into place, so the target path never
//  holds a half-written database.
//

import Foundation

enum CatalogSnapshot {
    /// Refreshes the mirror when it is stale. True means a new file landed
    /// and the store should reload; false covers "already fresh" and every
    /// failure alike, both of which leave the existing file alone.
    static func refreshIfNeeded(location: CatalogLocation) async -> Bool {
        guard isStale(location: location) else { return false }
        guard let root = repoRoot() else { return false }
        let script = root.appending(path: "apps/macos/scripts/catalog-snapshot.mjs")
        guard FileManager.default.fileExists(atPath: script.path) else { return false }

        // --out always names where the app reads, so a Settings override or
        // a GNOSIA_CATALOG env reaches the script the same way.
        return await withCheckedContinuation { done in
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
            proc.arguments = [
                "-lc",
                "node apps/macos/scripts/catalog-snapshot.mjs --out '\(location.catalogPath)'"
            ]
            proc.currentDirectoryURL = root
            proc.standardOutput = FileHandle.nullDevice
            proc.standardError = FileHandle.nullDevice
            proc.terminationHandler = { p in
                done.resume(returning: p.terminationStatus == 0)
            }
            do {
                try proc.run()
            } catch {
                done.resume(returning: false)
            }
        }
    }

    /// The mirror is stale when the file the script would read is newer
    /// than it, or when there is no mirror at all — the run then decides
    /// whether it can find a source at all. A source the env names that is
    /// not a file (a postgres DATABASE_URL) can't be stat'ed for freshness;
    /// with a mirror already present the run is skipped rather than spawned
    /// blind every launch.
    private static func isStale(location: CatalogLocation) -> Bool {
        let fm = FileManager.default
        guard fm.fileExists(atPath: location.catalogPath) else { return true }
        let env = ProcessInfo.processInfo.environment
        let raw = env["CATALOG_DB"]?.trimmingCharacters(in: .whitespaces)
        let source = (raw?.isEmpty == false ? raw : nil)
            ?? CatalogLocation.dataHome(env: env).appendingPathComponent("catalog.db").path
        guard
            let srcAt = (try? fm.attributesOfItem(atPath: source)[.modificationDate]) as? Date,
            let dstAt = (try? fm.attributesOfItem(atPath: location.catalogPath)[.modificationDate]) as? Date
        else { return false }
        return srcAt > dstAt
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
