//
//  SessionView.swift
//  Gnosia
//
//  The standalone session page — the web's /learn/<slug>/session route.
//  The walk itself lives in TutorPanel, which the concept workspace's
//  centre column embeds; this is the thin page wrapper that keeps the
//  pushed destination working exactly as it did: its own navigation
//  title, and "Exit to workspace" popping back where it came from.
//

import SwiftUI

struct SessionView: View {
    @Environment(\.dismiss) private var dismiss

    /// The concept the session is about.
    let slug: String
    /// `?mode=` on the web URL: `.learn` is Teach me, `.check` is Quiz me.
    var mode: SessionMode = .learn

    var body: some View {
        TutorPanel(slug: slug, mode: mode, onLeave: { dismiss() })
    }
}
