import Foundation
import Testing
@testable import Gnosia

/// S9-12: the palette is the web's. G.palette is held to globals.css's
/// effective `.gnosia` (`:root` then `.gnosia`) and `.gnosia.dark` (`:root`,
/// `.dark` and `.gnosia` in file order, then `.gnosia.dark`) values.
@Suite struct ThemeContract {
    /// `--name: #rrggbb` declarations of each top-level block, by selector.
    private func blocks() throws -> [(selector: String, vars: [String: UInt32])] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appending(path: "../../../web/src/app/globals.css")
            .standardized
        let css = try String(contentsOf: url, encoding: .utf8)
        var out: [(String, [String: UInt32])] = []
        let block = try Regex(#"(?m)^([.:][^{\n]*?)\s*\{([^}]*)\}"#)
        let decl = try Regex(#"--([a-z0-9-]+):\s*#([0-9a-fA-F]{6})\b"#)
        for match in css.matches(of: block) {
            let selector = String(match.output[1].substring ?? "")
            var vars: [String: UInt32] = [:]
            for d in String(match.output[2].substring ?? "").matches(of: decl) {
                vars[String(d.output[1].substring ?? "")] = UInt32(String(d.output[2].substring ?? ""), radix: 16)
            }
            out.append((selector, vars))
        }
        return out
    }

    @Test func everyTokenIsTheWebsValue() throws {
        var light: [String: UInt32] = [:]
        var dark: [String: UInt32] = [:]
        var gnosiaDark: [String: UInt32] = [:]
        for (selector, vars) in try blocks() {
            switch selector {
            case ":root":
                light.merge(vars) { _, new in new }
                dark.merge(vars) { _, new in new }
            case ".gnosia":
                light.merge(vars) { _, new in new }
                dark.merge(vars) { _, new in new }
            case ".dark":
                dark.merge(vars) { _, new in new }
            case ".gnosia.dark":
                gnosiaDark.merge(vars) { _, new in new }
            default: continue
            }
        }
        dark.merge(gnosiaDark) { _, new in new }
        #expect(!light.isEmpty && !gnosiaDark.isEmpty)
        for (name, pair) in G.palette {
            #expect(light[name] == pair.light, "light --\(name)")
            #expect(dark[name] == pair.dark, "dark --\(name)")
        }
    }
}
