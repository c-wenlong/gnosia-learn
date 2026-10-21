//
//  MathSupport.swift
//  Gnosia
//
//  Maths in plain text, for the surfaces too small for a webview — chat
//  bubbles, quiz choices. `mathSpanAt`/`splitMath` port the same rules
//  packages/tutor's markdown.ts and lib/math.ts run, so a message reads
//  the same here as on the web: `$$…$$` display, `$…$` inline, `\$` a
//  literal dollar, "$5-$10" prose.
//
//  The render is a LaTeX-to-readable-Unicode pass, not typesetting: the
//  web's own history says the table only has to keep the text legible
//  (its table failed on \frac and \sum, which is why KaTeX exists) — and
//  here `\frac{a}{b}` comes out as (a)/(b), which reads fine inside a
//  chat line. Anything unrecognised degrades to the command name.
//

import Foundation
import SwiftUI

/// The maths span `src` opens with, or nil — markdown.ts's mathSpanAt.
struct MathSpan {
    let source: String
    let display: Bool
    let length: Int
}

enum MathSupport {
    private static let displaySpan = try! NSRegularExpression(
        pattern: #"^\$\$((?:\\[\s\S]|[^\\$]|\$(?!\$))+?)\$\$"#
    )
    private static let inlineSpan = try! NSRegularExpression(
        pattern: #"^\$((?:\\[^\n]|[^\\$\s])(?:(?:\\[^\n]|[^\\$\n])*(?:\\[^\n]|[^\\$\s]))?)\$(?!\d)"#
    )

    static func spanAt(_ src: Substring) -> MathSpan? {
        guard src.first == "$" else { return nil }
        let ns = NSRange(src.startIndex..., in: src)
        if src.dropFirst().first == "$" {
            guard let m = displaySpan.firstMatch(in: String(src), range: ns),
                  let body = Range(m.range(at: 1), in: src) else { return nil }
            let source = String(src[body])
            guard !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
            return MathSpan(source: source.trimmingCharacters(in: .whitespacesAndNewlines),
                            display: true, length: m.range.length)
        }
        guard let m = inlineSpan.firstMatch(in: String(src), range: ns),
              let body = Range(m.range(at: 1), in: src) else { return nil }
        return MathSpan(source: String(src[body]), display: false, length: m.range.length)
    }

    /// A string cut into prose and maths — lib/math.ts's splitMath.
    enum Part { case text(String), inline(String), display(String) }

    static func split(_ text: String) -> [Part] {
        var parts: [Part] = []
        var prose = ""
        var i = text.startIndex
        func flush() {
            if !prose.isEmpty { parts.append(.text(prose)); prose = "" }
        }
        while i < text.endIndex {
            let ch = text[i]
            let next = text.index(after: i)
            if ch == "\\", next < text.endIndex, text[next] == "$" {
                prose += "$"
                i = text.index(after: next)
                continue
            }
            if ch == "$", let span = spanAt(text[i...]) {
                flush()
                parts.append(span.display ? .display(span.source) : .inline(span.source))
                i = text.index(i, offsetBy: span.length)
                continue
            }
            if ch == "$", next < text.endIndex, text[next] == "$" {
                prose += "$$"
                i = text.index(after: next)
                continue
            }
            prose.append(ch)
            i = next
        }
        flush()
        return parts
    }

    // MARK: - LaTeX → readable Unicode

    private static let names: [String: String] = [
        // Greek
        "alpha": "α", "beta": "β", "gamma": "γ", "delta": "δ", "epsilon": "ε",
        "varepsilon": "ε", "zeta": "ζ", "eta": "η", "theta": "θ", "vartheta": "ϑ",
        "iota": "ι", "kappa": "κ", "lambda": "λ", "mu": "μ", "nu": "ν", "xi": "ξ",
        "pi": "π", "varpi": "ϖ", "rho": "ρ", "varrho": "ϱ", "sigma": "σ",
        "varsigma": "ς", "tau": "τ", "upsilon": "υ", "phi": "φ", "varphi": "ϕ",
        "chi": "χ", "psi": "ψ", "omega": "ω",
        "Gamma": "Γ", "Delta": "Δ", "Theta": "Θ", "Lambda": "Λ", "Xi": "Ξ",
        "Pi": "Π", "Sigma": "Σ", "Upsilon": "Υ", "Phi": "Φ", "Psi": "Ψ", "Omega": "Ω",
        // Operators that read as a word
        "log": "log", "ln": "ln", "lg": "lg", "exp": "exp", "max": "max", "min": "min",
        "arg": "arg", "sup": "sup", "inf": "inf", "lim": "lim", "sin": "sin",
        "cos": "cos", "tan": "tan", "cot": "cot", "sec": "sec", "csc": "csc",
        "sinh": "sinh", "cosh": "cosh", "tanh": "tanh", "det": "det", "deg": "deg",
        "dim": "dim", "ker": "ker", "gcd": "gcd", "Pr": "Pr", "mod": "mod",
        "bmod": "mod", "limsup": "lim sup", "liminf": "lim inf", "argmax": "arg max",
        "argmin": "arg min", "loglik": "loglik",
        // Symbols
        "cdot": "·", "times": "×", "div": "÷", "pm": "±", "mp": "∓",
        "ast": "∗", "star": "⋆", "circ": "∘", "bullet": "•", "oplus": "⊕",
        "ominus": "⊖", "otimes": "⊗", "odot": "⊙", "oslash": "⊘",
        "le": "≤", "leq": "≤", "leqslant": "≤", "ge": "≥", "geq": "≥",
        "geqslant": "≥", "neq": "≠", "ne": "≠", "approx": "≈", "approxeq": "≈",
        "equiv": "≡", "propto": "∝", "sim": "∼", "simeq": "≃", "cong": "≅",
        "ll": "≪", "gg": "≫", "asymp": "≍", "doteq": "≐", "prec": "≺",
        "succ": "≻", "preceq": "⪯", "succeq": "⪰", "perp": "⊥", "parallel": "∥",
        "to": "→", "rightarrow": "→", "longrightarrow": "⟶", "leftarrow": "←",
        "longleftarrow": "⟵", "Rightarrow": "⇒", "Leftarrow": "⇐",
        "Leftrightarrow": "⇔", "leftrightarrow": "↔", "mapsto": "↦",
        "implies": "⇒", "iff": "⇔", "uparrow": "↑", "downarrow": "↓",
        "in": "∈", "notin": "∉", "ni": "∋", "subset": "⊂", "supset": "⊃",
        "subseteq": "⊆", "supseteq": "⊇", "nsubseteq": "⊈", "cup": "∪",
        "cap": "∩", "setminus": "∖", "emptyset": "∅", "varnothing": "∅",
        "forall": "∀", "exists": "∃", "nexists": "∄", "neg": "¬", "lnot": "¬",
        "land": "∧", "wedge": "∧", "lor": "∨", "vee": "∨", "top": "⊤",
        "bot": "⊥", "vdash": "⊢", "models": "⊨", "angle": "∠",
        "sum": "Σ", "prod": "Π", "coprod": "∐", "int": "∫", "iint": "∬",
        "oint": "∮", "partial": "∂", "nabla": "∇", "infty": "∞",
        "aleph": "ℵ", "ell": "ℓ", "hbar": "ℏ", "Re": "ℜ", "Im": "ℑ",
        "mid": "∣", "ldots": "…", "cdots": "⋯", "vdots": "⋮", "ddots": "⋱",
        "dots": "…", "dotsc": "…", "dotsb": "⋯", "prime": "′", "dagger": "†",
        "ddagger": "‡", "S": "§", "P": "¶", "copyright": "©", "degree": "°",
        "triangle": "△", "square": "□", "Diamond": "◇", "checkmark": "✓",
        "langle": "⟨", "rangle": "⟩", "lfloor": "⌊", "rfloor": "⌋",
        "lceil": "⌈", "rceil": "⌉",
    ]

    private static let mathbb: [Character: String] = [
        "R": "ℝ", "N": "ℕ", "Z": "ℤ", "Q": "ℚ", "C": "ℂ", "P": "ℙ",
        "H": "ℍ", "E": "𝔼", "F": "𝔽", "D": "𝔻", "B": "𝔹", "K": "𝕂",
        "1": "𝟙", "0": "𝟘",
    ]

    // Calligraphic capitals, U+1D49C area — only the letters with a code
    // point; the rest keep a plain letter rather than a lie.
    private static let mathcal: [Character: Character] = [
        "A": "𝒜", "B": "ℬ", "C": "𝒞", "D": "𝒟", "E": "ℰ", "F": "ℱ",
        "G": "𝒢", "H": "ℋ", "I": "ℐ", "J": "𝒥", "K": "𝒦", "L": "ℒ",
        "M": "ℳ", "N": "𝒩", "O": "𝒪", "P": "𝒫", "Q": "𝒬", "R": "ℛ",
        "S": "𝒮", "T": "𝒯", "U": "𝒰", "V": "𝒱", "W": "𝒲", "X": "𝒳",
        "Y": "𝒴", "Z": "𝒵",
    ]

    private static let subDigits: [Character: Character] = [
        "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅",
        "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋",
        "i": "ᵢ", "j": "ⱼ", "n": "ₙ", "k": "ₖ", "t": "ₜ", "x": "ₓ",
        "(": "₍", ")": "₎",
    ]
    private static let superDigits: [Character: Character] = [
        "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵",
        "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻",
        "n": "ⁿ", "i": "ⁱ", "t": "ᵗ", "k": "ᵏ", "(": "⁽", ")": "⁾",
        "a": "ᵃ", "b": "ᵇ", "c": "ᶜ", "d": "ᵈ", "e": "ᵉ",
    ]

    private static let accents: [String: Character] = [
        "hat": "\u{0302}", "widehat": "\u{0302}", "bar": "\u{0304}",
        "overline": "\u{0304}", "vec": "\u{20D7}", "dot": "\u{0307}",
        "ddot": "\u{0308}", "tilde": "\u{0303}", "widetilde": "\u{0303}",
        "breve": "\u{0306}", "check": "\u{030C}",
    ]

    /// One LaTeX source as flat readable text. Grouped constructs recurse;
    /// unknown commands keep their name so "Sublayer" stays a word.
    static func flatten(_ src: String) -> String {
        var s = src
        var i = s.startIndex
        var out = ""
        while i < s.endIndex {
            let c = s[i]
            if c == "\\" {
                let next = s.index(after: i)
                guard next < s.endIndex else { break }
                if let m = readCommand(s, from: next) {
                    i = m.end
                    out += render(command: m.name, in: &s, at: &i)
                } else {
                    // \x single-char escapes and spacing
                    let e = s[next]
                    out += escChar(e) ?? String(e)
                    i = s.index(after: next)
                }
            } else if c == "{" || c == "}" {
                i = s.index(after: i)
            } else if c == "_" || c == "^" {
                i = s.index(after: i)
                let (arg, end) = readArg(s, at: i)
                i = end
                let flat = flatten(arg)
                let table = c == "_" ? subDigits : superDigits
                if !flat.isEmpty, flat.allSatisfy({ table[$0] != nil }) {
                    out += String(flat.map { table[$0]! })
                } else {
                    out += (c == "_" ? "_" : "^") + flat
                }
            } else if c == "~" {
                out += " "
                i = s.index(after: i)
            } else {
                out.append(c)
                i = s.index(after: i)
            }
        }
        return out
    }

    private static func readCommand(_ s: String, from i: String.Index) -> (name: String, end: String.Index)? {
        var j = i
        while j < s.endIndex, s[j].isLetter { j = s.index(after: j) }
        guard j > i else { return nil }
        return (String(s[i..<j]), j)
    }

    /// `{...}` or the next single token/command.
    private static func readArg(_ s: String, at i0: String.Index) -> (String, String.Index) {
        var i = i0
        while i < s.endIndex, s[i] == " " { i = s.index(after: i) }
        guard i < s.endIndex else { return ("", i) }
        if s[i] == "{" {
            var depth = 1
            var j = s.index(after: i)
            let start = j
            while j < s.endIndex, depth > 0 {
                if s[j] == "{" { depth += 1 }
                if s[j] == "}" { depth -= 1 }
                if depth == 0 { return (String(s[start..<j]), s.index(after: j)) }
                j = s.index(after: j)
            }
            return (String(s[start...]), s.endIndex)
        }
        if s[i] == "\\", let m = readCommand(s, from: s.index(after: i)) {
            return (String(s[i..<m.end]), m.end)
        }
        return (String(s[i]), s.index(after: i))
    }

    private static func escChar(_ c: Character) -> String? {
        switch c {
        case "$", "%", "#": return String(c)
        case "&": return "&"
        case "{": return "{"
        case "}": return "}"
        case "_": return "_"
        case "|": return "‖"
        case " ", ",", ";", ":": return " "
        case "!": return ""
        default: return nil
        }
    }

    private static func render(command: String, in s: inout String, at i: inout String.Index) -> String {
        func arg() -> String {
            let (a, end) = readArg(s, at: i)
            i = end
            return a
        }
        switch command {
        case "frac", "dfrac", "tfrac":
            let num = flatten(arg()), den = flatten(arg())
            let n = num.count > 1 ? "(\(num))" : num
            let d = den.count > 1 ? "(\(den))" : den
            return "\(n)/\(d)"
        case "sqrt":
            // \sqrt[n]{x} — skip an optional [n]
            var idx = i
            while idx < s.endIndex, s[idx] == " " { idx = s.index(after: idx) }
            if idx < s.endIndex, s[idx] == "[" {
                var j = idx
                while j < s.endIndex, s[j] != "]" { j = s.index(after: j) }
                if j < s.endIndex { i = s.index(after: j) }
            }
            return "√(" + flatten(arg()) + ")"
        case "operatorname", "operatorname*", "text", "mathrm", "mathbf", "mathit",
             "mathsf", "mathtt", "textbf", "textit", "emph", "textrm", "boldsymbol",
             "rm", "bf", "it", "quad", "qquad", "displaystyle", "limits",
             "phantom", "hphantom", "vphantom", "smash":
            if command == "quad" || command == "qquad" { return " " }
            return flatten(arg())
        case "mathbb":
            return arg().map { mathbb[$0] ?? String($0) }.joined()
        case "mathcal":
            return arg().map { mathcal[$0].map(String.init) ?? String($0) }.joined()
        case "mathfrak", "mathscr", "mathsfit":
            return flatten(arg())
        case "left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr",
             "Bigl", "Bigr", "biggl", "biggr", "Biggl", "Biggr", "middle":
            // sizing command then a delimiter
            var idx = i
            while idx < s.endIndex, s[idx] == " " { idx = s.index(after: idx) }
            if idx < s.endIndex {
                if s[idx] == "\\", let m = readCommand(s, from: s.index(after: idx)) {
                    i = m.end
                    return names[m.name] ?? delim(String(s[s.index(after: idx)...m.end].dropFirst()))
                }
                if s[idx] == "." { i = s.index(after: idx); return "" }
                let d = s[idx]; i = s.index(after: idx)
                return String(d)
            }
            return ""
        case "begin", "end":
            _ = arg()  // \begin{env} / \end{env} — drop the marker, keep the body
            return command == "begin" ? "" : "\n"
        case "item":
            return "\n• "
        case "hline", "cline", "toprule", "midrule", "bottomrule":
            if command == "cline" { _ = arg() }
            return ""
        case "textsubscript", "textsuperscript":
            return flatten(arg())
        case "xrightarrow", "xleftarrow":
            _ = arg()  // optional [below]
            return command == "xrightarrow" ? "→(\(flatten(arg())))" : "←(\(flatten(arg())))"
        case "underbrace":
            let body = flatten(arg())
            var idx = i
            while idx < s.endIndex, s[idx] == " " { idx = s.index(after: idx) }
            if idx < s.endIndex, s[idx] == "_" {
                i = s.index(after: idx)
                return "⏟(\(body))_\(flatten(arg()))"
            }
            return "⏟(\(body))"
        case "overbrace":
            return "⏞(\(flatten(arg())))"
        case "boxed", "fbox":
            return "[" + flatten(arg()) + "]"
        case "stackrel", "overset":
            let top = flatten(arg()), base = flatten(arg())
            return "\(base)^{\(top)}"
        case "substack":
            return "(" + flatten(arg()).replacingOccurrences(of: "\\\\", with: "; ") + ")"
        case "url", "href":
            _ = arg()  // url
            return command == "href" ? flatten(arg()) : ""
        default:
            if let acc = accents[command] {
                return flatten(arg()) + String(acc)
            }
            if let named = names[command] { return named }
            return command
        }
    }

    private static func delim(_ name: String) -> String {
        names[name] ?? name
    }
}

/// A plain string with its maths flattened to readable text — the web's
/// MathText for surfaces that do not carry a webview. Inline maths stay in
/// the line they were written in; display maths get their own centred one.
struct MathText: View {
    let text: String
    var font: Font = .callout

    /// Prose and inline maths merge into one wrapped Text run; each display
    /// maths breaks the run out to its own centred line.
    private enum Group { case run(Text), display(String) }

    private var groups: [Group] {
        var out: [Group] = []
        var run = Text("")
        var has = false
        for part in MathSupport.split(text) {
            switch part {
            case .text(let s):
                run = run + Text(s); has = true
            case .inline(let m):
                run = run + Text(MathSupport.flatten(m)).italic(); has = true
            case .display(let m):
                if has { out.append(.run(run)); run = Text(""); has = false }
                out.append(.display(MathSupport.flatten(m)))
            }
        }
        if has { out.append(.run(run)) }
        return out
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(groups.enumerated()), id: \.offset) { _, group in
                switch group {
                case .run(let t):
                    t.font(font).frame(maxWidth: .infinity, alignment: .leading)
                case .display(let m):
                    Text(m).font(font)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 2)
                }
            }
        }
    }
}
