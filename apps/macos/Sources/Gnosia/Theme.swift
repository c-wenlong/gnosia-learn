//
//  Theme.swift
//  Gnosia
//
//  The brand palette, ported token for token from the web app's
//  `.gnosia` / `.gnosia.dark` blocks in apps/web/src/app/globals.css —
//  cream paper and navy ink in light, the site's dark navy in dark.
//  `docs/design/BRAND.md` there has the provenance and contrast math.
//
//  The window takes `--page` under everything (including the sidebar's
//  material) so the whole app reads warm instead of default grey.
//

import AppKit
import SwiftUI

extension Color {
    /// sRGB hex, `#rrggbb`.
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 8) & 0xff) / 255,
            blue: Double(hex & 0xff) / 255
        )
    }

    /// Light value by default, dark value inside a dark appearance.
    init(light: UInt32, dark: UInt32) {
        self.init(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return NSColor(hex: isDark ? dark : light)
        })
    }
}

private extension NSColor {
    convenience init(hex: UInt32) {
        self.init(
            srgbRed: CGFloat((hex >> 16) & 0xff) / 255,
            green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255,
            alpha: 1
        )
    }
}

/// The `.gnosia` palette, one name per web token.
enum G {
    /// Every token as the web's CSS variable names it, light and dark: the
    /// effective `.gnosia` and `.gnosia.dark` values of globals.css (a token
    /// those blocks leave out takes `:root`'s or `.dark`'s).
    /// ThemeContractTests holds this table to that file, so a palette change
    /// on the web fails `swift test` until it lands here; ChatMarkdownView
    /// reads its colours from here too.
    static let palette: [String: (light: UInt32, dark: UInt32)] = [
        "page": (0xfaf6ec, 0x0a1621),
        "surface": (0xfffdf8, 0x102131),
        "surface2": (0xf3eee1, 0x1b2c3c),
        "tint": (0xe2efec, 0x112c32),
        "border": (0xe6dfd0, 0x3d4c5b),
        "hair": (0xede7da, 0x263645),
        "track": (0xe6dfd0, 0x000000),
        "text": (0x15283a, 0xeee8dc),
        "text2": (0x605b54, 0xa3b2bf),
        "text3": (0x878276, 0x74828f),
        "accent": (0x148285, 0x148285),
        "accent-text": (0x0f5f61, 0x5cbab3),
        "btn-face": (0x0f5f61, 0x5cbab3),
        "btn-text": (0xfaf6ec, 0x0a1621),
        "streak": (0xb3842c, 0xe2b95e),
        "streak-text": (0x916a23, 0xe2b95e),
        "ok": (0x29cc57, 0x29cc57),
        "ok-text": (0x008024, 0x5ed981),
        "warn-text": (0x8c6800, 0xf9d25c),
        "danger": (0xc43939, 0xff8585),
    ]

    /// `#rrggbb` of a token in one appearance, for the web views' CSS.
    static func hex(_ name: String, dark: Bool) -> String {
        guard let pair = palette[name] else { return "#ff00ff" }
        return String(format: "#%06x", dark ? pair.dark : pair.light)
    }

    private static func token(_ name: String) -> Color {
        let pair = palette[name] ?? (0xff00ff, 0xff00ff)
        return Color(light: pair.light, dark: pair.dark)
    }

    /// Page ground — cream paper / dark navy.
    static let page = token("page")
    /// Cards — a whiter cream / one step off navy.
    static let surface = token("surface")
    /// Deeper cream / two steps off navy — pressed fills, the sidebar's
    /// active row, the search field.
    static let surface2 = token("surface2")
    /// The pale teal wash behind accent-tinted elements.
    static let tint = token("tint")
    /// Card and field borders — warm tan / navy-grey.
    static let border = token("border")
    /// Hairlines inside cards, a step quieter than `border`.
    static let hair = token("hair")
    /// The empty part of a bar or meter.
    static let track = token("track")

    /// Navy-black ink / cream ink.
    static let text = token("text")
    /// The muted reading ink — warm grey / grey-blue mist.
    static let text2 = token("text2")
    /// Hints and placeholders.
    static let text3 = token("text3")

    /// The mid teal — fills, links, the active chip.
    static let accent = token("accent")
    /// Accent as readable text — deep teal / lifted teal.
    static let accentText = token("accent-text")
    /// The brand button: deep teal face / lifted teal face…
    static let btnFace = token("btn-face")
    /// …with the cream label / navy label.
    static let btnText = token("btn-text")

    /// The streak gold — day markers, due badges.
    static let streak = token("streak")
    static let streakText = token("streak-text")

    /// Signals, same hues as the web's.
    static let ok = token("ok")
    static let okText = token("ok-text")
    static let warnText = token("warn-text")
    static let danger = token("danger")
}

extension Font {
    /// Page titles, the serif face the web draws in Georgia — New York on
    /// macOS is its own serif in the same cut.
    static func gnosiaTitle(_ size: CGFloat = 28) -> Font {
        .system(size: size, weight: .semibold, design: .serif)
    }
}
