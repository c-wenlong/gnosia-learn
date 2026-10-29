//
//  DataContractTests.swift
//  GnosiaTests
//
//  The app's half of the data it shares with the web: playback coverage
//  and the merged resume point (S9-03, S9-04), check statuses keyed on the
//  concept (S9-05), sessions from both files, length caps in the routes'
//  units (S9-13), the snapshot's staleness under WAL (S9-09), and local
//  answers the mirror already holds (S9-16).
//

import Foundation
import Testing
import CSQLite3
@testable import Gnosia

private func tempPath(_ name: String) throws -> (dir: URL, path: String) {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("gnosia-tests-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return (dir, dir.appendingPathComponent(name).path)
}

/// Every row of one query's first column, as text.
private func column(_ path: String, _ sql: String) throws -> [String] {
    var db: OpaquePointer?
    try #require(sqlite3_open_v2(path, &db, SQLITE_OPEN_READONLY, nil) == SQLITE_OK)
    defer { sqlite3_close(db) }
    var stmt: OpaquePointer?
    try #require(sqlite3_prepare_v2(db, sql, -1, &stmt, nil) == SQLITE_OK)
    defer { sqlite3_finalize(stmt) }
    var out: [String] = []
    while sqlite3_step(stmt) == SQLITE_ROW {
        out.append(sqlite3_column_text(stmt, 0).map { String(cString: $0) } ?? "")
    }
    return out
}

@Suite struct Coverage {
    @Test func rangesMergeAsTheWebsDo() {
        #expect(mergeRanges([[10.3, 20], [0, 10], [50, 40], [30, 31]]) == [[0, 20], [30, 31]])
        #expect(clampRanges([[-5, 3], [98, 120]], duration: 100) == [[0, 3], [98, 100]])
        #expect(playbackCoverage([[0, 45]], duration: 50) == 0.9)
        #expect(playbackCoverage([[0, 10]], duration: 0) == 0)
    }

    @MainActor @Test func aScrubToTheEndIsNotAWatch() throws {
        let (dir, path) = try tempPath("learner.db")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = LearnerStore(path: path)

        // Dragged to 90 s of 100 and played to the end: ten seconds seen.
        store.setWatch("v", seconds: 100, done: false, mirror: .position(duration: 100, ranges: [[90, 100]]))
        #expect(store.watchEntry(for: "v")?.done == false)
        // The row keeps what played, never [0, playhead]; the playback
        // mirror sends these same ranges.
        #expect(store.watchEntry(for: "v")?.ranges == [[90, 100]])

        // The rest played later: coverage crosses and the stretches go together.
        store.setWatch("v", seconds: 85, done: false, mirror: .position(duration: 100, ranges: [[0, 85]]))
        #expect(store.watchEntry(for: "v")?.done == true)
        #expect(store.watchEntry(for: "v")?.ranges == [[0, 85], [90, 100]])

        // Done is sticky, and the ranges survive a reopen.
        store.setWatch("v", seconds: 10, done: false, mirror: .position(duration: 100, ranges: []))
        let reopened = LearnerStore(path: path)
        reopened.loadIfNeeded()
        #expect(reopened.watchEntry(for: "v")?.done == true)
        #expect(reopened.watchEntry(for: "v")?.ranges == [[0, 85], [90, 100]])
    }
}

@Suite struct ResumePoint {
    private let web = Playback(position: 460, duration: 600, watchedAt: nil, updatedAt: "2026-10-30T10:00:00.000Z")

    @Test func theWebsPositionResumesWhenItIsNewer() {
        let older = WatchMark(seconds: 30, done: false, duration: 600, updatedAt: parseIsoInstant("2026-10-29T10:00:00Z"))
        let merged = mergedPlayback(stored: web, local: older)
        #expect(merged?.position == 460)
        #expect(resumeAt(merged) == 460)
    }

    @Test func aNewerLocalWatchWinsAndWatchedIsSticky() {
        let watchedWeb = Playback(position: 600, duration: 600, watchedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z")
        let newer = WatchMark(seconds: 120, done: false, duration: 600, updatedAt: parseIsoInstant("2026-10-30T11:00:00Z"))
        let merged = mergedPlayback(stored: watchedWeb, local: newer)
        #expect(merged?.position == 120)
        #expect(merged?.watchedAt == "2026-10-01T00:00:00.000Z")
    }

    @Test func eitherSourceAloneStands() {
        #expect(mergedPlayback(stored: web, local: nil)?.position == 460)
        let local = WatchMark(seconds: 595, done: true, duration: 600, updatedAt: Date(timeIntervalSince1970: 0))
        let merged = mergedPlayback(stored: nil, local: local)
        #expect(merged?.watchedAt == "1970-01-01T00:00:00.000Z")
        // Inside the last ten seconds: the web's rule starts it over.
        #expect(resumeAt(merged) == 0)
        // A mark with no duration cannot stand as a playback.
        #expect(mergedPlayback(stored: nil, local: WatchMark(seconds: 3, done: true)) == nil)
    }
}

@Suite struct Events {
    private func observation(_ question: String, correct: Bool, concept: String?, at: Double) -> CatalogEvent {
        CatalogEvent(id: 0, at: Date(timeIntervalSince1970: at), type: "observation",
                     payload: ["question": question, "correct": correct], conceptSlug: concept)
    }

    @Test func twoConceptsAskingTheSameQuestionKeepTheirOwnStatus() {
        let check = ConceptCheck(id: "c1", question: "Why does it converge?", answer: "a", why: "", source: "note")
        let events = [
            observation("Why does it converge?", correct: true, concept: "alpha", at: 1),
            observation("Why does it converge?", correct: false, concept: "beta", at: 2),
        ]
        #expect(checkStatuses([check], events: events, slug: "alpha").first?.status == .passed)
        #expect(checkStatuses([check], events: events, slug: "beta").first?.status == .missed)
        #expect(checkStatuses([check], events: events, slug: "gamma").first?.status == .untried)
        // An old mirror's row names no concept and still matches by its text.
        let legacy = [observation("Why does it converge?", correct: true, concept: nil, at: 1)]
        #expect(checkStatuses([check], events: legacy, slug: "gamma").first?.status == .passed)
    }

    @Test func sessionsFromBothFilesMergeByTheNewerWrite() {
        let web = [CatalogSession(id: "a", title: "From the web", goal: nil, updatedAt: Date(timeIntervalSince1970: 50)),
                   CatalogSession(id: "b", title: "Old", goal: nil, updatedAt: Date(timeIntervalSince1970: 10))]
        let local = [CatalogSession(id: "b", title: "Newer here", goal: nil, updatedAt: Date(timeIntervalSince1970: 20))]
        let merged = mergedSessions(web, local)
        #expect(merged.map(\.id) == ["a", "b"])
        #expect(merged.last?.title == "Newer here")
    }

    @MainActor @Test func answersTheMirrorHoldsArePrunedLocally() throws {
        let mirrored = [CatalogEvent(id: 1, at: Date(), type: "review", payload: ["requestId": "r1"])]
        let ids = mirroredRequests(in: mirrored)
        #expect(ids == ["r1"])
        #expect(isMirroredAnswer(CatalogEvent(id: 9, at: Date(), type: "review", payload: ["requestId": "r1"]), in: ids))
        #expect(!isMirroredAnswer(CatalogEvent(id: 9, at: Date(), type: "visit", payload: ["requestId": "r1"]), in: ids))

        let (dir, path) = try tempPath("learner.db")
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = LearnerStore(path: path)
        for id in ["r1", "r2"] {
            _ = store.recordReviewGrade(ReviewGradeWrite(
                conceptId: "alpha", grade: 4, rating: 3, requestId: id, at: Date(),
                pLBefore: 0.5, pLAfter: 0.6,
                mastery: CatalogMastery(conceptSlug: "alpha", pL: 0.6, observations: 1, correct: 1, lastSeen: Date()),
                card: CatalogReview(conceptSlug: "alpha", repetitions: 1, ease: 2.5, intervalDays: 1, lapses: 0,
                                    due: Date(), lastReviewed: Date(), leech: false)
            ))
        }
        #expect(try column(path, "SELECT json_extract(payload, '$.requestId') FROM event WHERE type = 'review' ORDER BY id") == ["r1", "r2"])
        store.pruneMirroredEvents(ids)
        #expect(try column(path, "SELECT json_extract(payload, '$.requestId') FROM event WHERE type = 'review'") == ["r2"])
    }
}

@Suite struct RouteCaps {
    @Test func aNoteIsCutInTheRoutesUnits() {
        // 19,999 letters and two emoji: 20,001 characters but 20,003 units.
        let note = String(repeating: "a", count: 19_999) + "👍👍"
        let sent = learnerNoteValue(note)
        #expect(sent.utf16.count <= maxNoteChars)
        #expect(sent == String(repeating: "a", count: 19_999))
    }

    @Test func aNameIsMeasuredCleanedAndInUnits() {
        #expect(assetNameTooLong(String(repeating: "👍", count: 101)))
        #expect(!assetNameTooLong(String(repeating: "👍", count: 100)))
        // Runs of spaces collapse before the count, as the route counts.
        #expect(!assetNameTooLong(String(repeating: "a ", count: 100) + String(repeating: " ", count: 50)))
    }
}

@Suite struct SnapshotFreshness {
    @Test func aWalWriteMakesTheMirrorStale() throws {
        let (dir, source) = try tempPath("catalog.db")
        defer { try? FileManager.default.removeItem(at: dir) }
        let mirror = dir.appendingPathComponent("app-catalog.db").path
        let fm = FileManager.default
        let t0 = Date(timeIntervalSince1970: 1_000_000)
        for path in [source, mirror] { fm.createFile(atPath: path, contents: Data()) }
        try fm.setAttributes([.modificationDate: t0], ofItemAtPath: source)
        try fm.setAttributes([.modificationDate: t0.addingTimeInterval(60)], ofItemAtPath: mirror)
        #expect(!CatalogSnapshot.isStale(mirror: mirror, source: source))
        // The row landed in the WAL; the main file's time did not move.
        fm.createFile(atPath: source + "-wal", contents: Data())
        try fm.setAttributes([.modificationDate: t0.addingTimeInterval(120)], ofItemAtPath: source + "-wal")
        #expect(CatalogSnapshot.isStale(mirror: mirror, source: source))
    }

    @Test func aFailureSaysWhatTheScriptSaid() {
        #expect(CatalogSnapshot.failureLine("", status: 1) == "The snapshot exited with status 1.")
        #expect(CatalogSnapshot.failureLine("noise\n\ncatalog-snapshot: no catalog at /x\n", status: 1)
            == "noise catalog-snapshot: no catalog at /x")
    }
}
