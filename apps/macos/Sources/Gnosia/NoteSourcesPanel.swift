//
//  NoteSourcesPanel.swift
//  Gnosia
//
//  The workspace's left column — apps/web/src/components/workspace/
//  NoteAndSources.tsx natively: the summary, what this concept needs and
//  what needs it, the sources the tutor cites, the backlinks, and the
//  whole note behind a "Read the whole note" disclosure (the web's
//  NoteDisclosure, which mounts the note lazily and keeps it once it has).
//
//  What the mirror cannot carry stays honest: the web's sources are
//  CitationSource objects with numbered entries and resolved hrefs; the
//  catalog ships the note's `sources` as plain strings, so the note row
//  (green, "Your note · N checks") is always first and each string shows
//  as the web's source dot rule reads it — a link when it parses as one,
//  red when it names a PDF, quiet otherwise.
//

import SwiftUI

struct NoteSourcesPanel: View {
    let w: ConceptWorkspace

    /// The note disclosure's two bits of the web's open/opened pair.
    @State private var noteOpen = false
    @State private var noteMounted = false

    var body: some View {
        Group {
            section("Summary") {
                if w.summary.isEmpty {
                    Text("No summary written yet.")
                        .font(.callout)
                        .foregroundStyle(G.text2)
                } else {
                    MathText(text: w.summary, font: .callout)
                        .foregroundStyle(G.text2)
                }
            }

            section("Prerequisites") {
                if w.requires.isEmpty && w.assumes.isEmpty {
                    Text("None. This is a starting point.")
                        .font(.callout)
                        .foregroundStyle(G.text3)
                } else {
                    neighbourList(w.requires)
                    neighbourList(w.assumes, note: "background")
                }
            }

            section("Leads to") {
                neighbourList(w.dependants, empty: "Nothing requires this yet.")
            }

            section("Sources") {
                VStack(alignment: .leading, spacing: 8) {
                    sourceRow(dot: G.ok) {
                        Text("Your note · \(w.checks.count) \(w.checks.count == 1 ? "check" : "checks")")
                            .font(.callout)
                            .foregroundStyle(G.text)
                    }
                    ForEach(w.sources, id: \.self) { source in
                        sourceRow(dot: sourceDot(source)) {
                            if let url = sourceURL(source) {
                                Link(source, destination: url)
                                    .font(.callout)
                                    .lineLimit(1)
                            } else {
                                Text(source)
                                    .font(.callout)
                                    .foregroundStyle(G.text)
                                    .lineLimit(1)
                            }
                        }
                    }
                }
            }

            section("Backlinks") {
                if w.backlinks.isEmpty {
                    Text("No other note references this one.")
                        .font(.callout)
                        .foregroundStyle(G.text2)
                } else {
                    Text("Referenced by \(w.backlinks.count) \(w.backlinks.count == 1 ? "note" : "notes")")
                        .font(.callout)
                        .foregroundStyle(G.text2)
                    FlowLayout(spacing: 8) {
                        ForEach(w.backlinks) { ref in
                            NavigationLink(value: AppDestination.concept(ref.slug)) {
                                Text(ref.title)
                                    .font(.caption)
                                    .foregroundStyle(G.accentText)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }

            section("Note") {
                if let body = w.body,
                   !body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    Button(noteOpen ? "Hide the note" : "Read the whole note") {
                        withAnimation(.easeInOut(duration: 0.2)) { noteOpen.toggle() }
                        noteMounted = true
                    }
                    .buttonStyle(.plain)
                    .font(.callout)
                    .foregroundStyle(G.accentText)
                    // The web mounts the note on the first open and keeps
                    // it — a shut webview is parked, not torn down, so the
                    // scroll and the render are there when it reopens.
                    if noteMounted {
                        VStack(alignment: .leading, spacing: 8) {
                            NoteBodyView(source: body, stripTitle: w.title)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            if let path = w.notePath {
                                Text(path)
                                    .font(.caption.monospaced())
                                    .foregroundStyle(G.text3)
                            }
                        }
                        .padding(.top, 4)
                        .opacity(noteOpen ? 1 : 0)
                        .frame(maxHeight: noteOpen ? .infinity : 0)
                        .clipped()
                        .allowsHitTesting(noteOpen)
                        .accessibilityHidden(!noteOpen)
                    }
                } else {
                    Text("The concept row was mirrored without a note body — an older snapshot, or a note never indexed.")
                        .font(.callout)
                        .foregroundStyle(G.text3)
                }
            }
        }
    }

    /// One titled section — the web's `Section`: a 13px bold heading
    /// over its column.
    private func section<Content: View>(_ title: String, @ViewBuilder _ content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.callout.weight(.bold))
                .foregroundStyle(G.text)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A vertical list of linked neighbours — the web's NeighbourList:
    /// mastery dot, title, an optional quiet tag like "background".
    @ViewBuilder
    private func neighbourList(_ refs: [NeighbourRef], empty: String = "", note: String? = nil) -> some View {
        if refs.isEmpty {
            if !empty.isEmpty {
                Text(empty)
                    .font(.callout)
                    .foregroundStyle(G.text3)
            }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(refs) { ref in
                    NavigationLink(value: AppDestination.concept(ref.slug)) {
                        HStack(spacing: 8) {
                            BucketDot(bucket: ref.bucket)
                            Text(ref.title)
                                .font(.callout)
                                .foregroundStyle(G.text)
                                .lineLimit(1)
                            if let note {
                                Text(note)
                                    .font(.caption)
                                    .foregroundStyle(G.text3)
                            }
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// A source row's dot and label — the web's `li`: 8px dot, 13px text.
    private func sourceRow<Content: View>(dot: Color, @ViewBuilder _ content: () -> Content) -> some View {
        HStack(alignment: .center, spacing: 8) {
            Circle()
                .fill(dot)
                .frame(width: 8, height: 8)
            content()
            Spacer(minLength: 0)
        }
    }

    /// A source's dot colour — the web's sourceDot: the note itself is
    /// green (the first row, handled by the caller), a PDF red, a link
    /// accent, a bare name the quiet ink.
    private func sourceDot(_ source: String) -> Color {
        if source.range(of: #"\.pdf\b|\bpdf\b"#, options: [.regularExpression, .caseInsensitive]) != nil {
            return G.danger
        }
        if sourceURL(source) != nil { return G.accent }
        return G.text3
    }

    /// A source that is a URL — the catalog carries the string raw, so a
    /// `https://…` line parses as one; anything else is a label.
    private func sourceURL(_ source: String) -> URL? {
        guard let url = URL(string: source),
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https"
        else { return nil }
        return url
    }
}
