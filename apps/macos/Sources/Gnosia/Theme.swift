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
    /// Page ground — cream paper / dark navy.
    static let page = Color(light: 0xfaf6ec, dark: 0x0a1621)
    /// Cards — a whiter cream / one step off navy.
    static let surface = Color(light: 0xfffdf8, dark: 0x102131)
    /// Deeper cream / two steps off navy — pressed fills, the sidebar's
    /// active row, the search field.
    static let surface2 = Color(light: 0xf3eee1, dark: 0x1b2c3c)
    /// The pale teal wash behind accent-tinted elements.
    static let tint = Color(light: 0xe2efec, dark: 0x112c32)
    /// Card and field borders — warm tan / navy-grey.
    static let border = Color(light: 0xe6dfd0, dark: 0x3d4c5b)
    /// Hairlines inside cards, a step quieter than `border`.
    static let hair = Color(light: 0xede7da, dark: 0x263645)
    /// The empty part of a bar or meter.
    static let track = Color(light: 0xe6dfd0, dark: 0x000000)

    /// Navy-black ink / cream ink.
    static let text = Color(light: 0x15283a, dark: 0xeee8dc)
    /// The muted reading ink — warm grey / grey-blue mist.
    static let text2 = Color(light: 0x605b54, dark: 0xa3b2bf)
    /// Hints and placeholders.
    static let text3 = Color(light: 0x878276, dark: 0x74828f)

    /// The mid teal — fills, links, the active chip.
    static let accent = Color(light: 0x148285, dark: 0x148285)
    /// Accent as readable text — deep teal / lifted teal.
    static let accentText = Color(light: 0x0f5f61, dark: 0x5cbab3)
    /// The brand button: deep teal face / lifted teal face…
    static let btnFace = Color(light: 0x0f5f61, dark: 0x5cbab3)
    /// …with the cream label / navy label.
    static let btnText = Color(light: 0xfaf6ec, dark: 0x0a1621)

    /// The streak gold — day markers, due badges.
    static let streak = Color(light: 0xb3842c, dark: 0xe2b95e)
    static let streakText = Color(light: 0x916a23, dark: 0xe2b95e)

    /// Signals, same hues as the web's.
    static let ok = Color(light: 0x29cc57, dark: 0x29cc57)
    static let okText = Color(light: 0x009b2b, dark: 0x5ed981)
    static let warnText = Color(light: 0x8c6800, dark: 0xf9d25c)
    static let danger = Color(light: 0xc43939, dark: 0xff8585)
}

extension Font {
    /// Page titles, the serif face the web draws in Georgia — New York on
    /// macOS is its own serif in the same cut.
    static func gnosiaTitle(_ size: CGFloat = 28) -> Font {
        .system(size: size, weight: .semibold, design: .serif)
    }
}
