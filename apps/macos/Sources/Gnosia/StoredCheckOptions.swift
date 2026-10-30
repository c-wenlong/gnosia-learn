//
//  StoredCheckOptions.swift
//  Gnosia
//
//  The tutor's wrong options per note check, as the catalog stores them
//  (`check_distractor`, docs/LEARN.md "Wrong options") and the snapshot
//  mirrors them for this owner: which stored rows still fit the checks a
//  note now holds. The port of `checkHash` and `readWrittenOptions` in
//  packages/tutor/src/server/check-options.ts, held to the web by
//  Tests/GnosiaTests/Fixtures/review-options.json.
//
//  Reads only. A review card asks with these when they fit and with the
//  notes' options when they do not; nothing on the review path asks the
//  tutor to write them (a session does, through the sidecar).
//

import CryptoKit
import Foundation

/// CHECK_OPTIONS_VERSION in packages/tutor/src/check-options.ts: part of
/// every stored row's hash, so options written under an older prompt read
/// as missing.
let checkOptionsVersion = 1

/// One check's stored options, as the snapshot holds them.
struct StoredCheckOptions: Hashable {
    let checkId: String
    let checkHash: String
    /// Exactly three.
    let options: [String]
}

/// The code points JavaScript's `String.prototype.trim` removes: its
/// WhiteSpace (tab, vertical tab, form feed, U+FEFF and the space
/// separators) and its LineTerminators. Not Foundation's
/// `.whitespacesAndNewlines`, which also takes U+0085 and leaves U+FEFF,
/// so a check with either at an end would hash apart from the web's.
private let jsTrimSet: Set<UInt32> = [
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680,
    0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A,
    0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF,
]

/// Whether JavaScript's `\s` (and so its `trim`) counts `scalar` as space.
func jsWhitespace(_ scalar: Unicode.Scalar) -> Bool {
    jsTrimSet.contains(scalar.value)
}

/// `text.trim()` as JavaScript does it.
func jsTrim(_ text: String) -> String {
    let scalars = text.unicodeScalars
    guard let start = scalars.firstIndex(where: { !jsWhitespace($0) }) else { return "" }
    let end = scalars.lastIndex(where: { !jsWhitespace($0) })!
    return String(scalars[start...end])
}

/// checkHash: sha256 of the prompt's version, the question and the answer,
/// each trimmed, as lowercase hex.
func checkOptionsHash(question: String, answer: String) -> String {
    let text = "v\(checkOptionsVersion)\n\(jsTrim(question))\n\(jsTrim(answer))"
    return SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
}

/// A row's `options` column, or nil when it is not three strings — a row
/// nothing here wrote reads as missing, as readCheckDistractors leaves it.
func parseStoredOptions(_ raw: String?) -> [String]? {
    guard let data = raw?.data(using: .utf8),
          let list = try? JSONSerialization.jsonObject(with: data) as? [Any],
          list.count == 3 else { return nil }
    let strings = list.compactMap { $0 as? String }
    return strings.count == 3 ? strings : nil
}

/// readWrittenOptions for one note: its checks' stored options by check id,
/// a row whose hash no longer matches its check (reworded, or another
/// check moved into its id) left out.
func writtenOptions(checks: [ConceptCheck], stored: [String: StoredCheckOptions]) -> [String: [String]] {
    var written: [String: [String]] = [:]
    for check in checks {
        guard let row = stored[check.id],
              row.checkHash == checkOptionsHash(question: check.question, answer: check.answer) else { continue }
        written[check.id] = row.options
    }
    return written
}
