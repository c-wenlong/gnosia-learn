//
//  AssetDetailView.swift
//  Gnosia
//
//  The detail pane for every kind that is not a video — that one keeps
//  VideoDetailView, and dispatch sends it there untouched. The shapes are
//  the web AssetBody's: a sidecar's lines as a cue list, a note's markdown
//  as prose, a diagram's SVG in a web view, a link as a link, a stored PDF
//  or still as itself, and a row whose body the snapshot does not carry as
//  its catalog facts.
//

import AppKit
import SwiftUI
import WebKit

struct AssetDetailView: View {
    let asset: CatalogAsset

    var body: some View {
        switch asset.kind {
        case "video":
            VideoDetailView(asset: asset)
        case "transcript":
            SidecarDetail(asset: asset, shape: .transcript)
        case "chapters":
            SidecarDetail(asset: asset, shape: .chapters)
        case "captions":
            SidecarDetail(asset: asset, shape: .captions)
        case "note":
            NoteDetail(asset: asset)
        case "diagram_svg":
            DiagramDetail(asset: asset)
        case "link":
            LinkDetail(asset: asset)
        case "poster":
            PosterDetail(asset: asset)
        case "pdf":
            PDFDetail(asset: asset)
        default:
            FallbackDetail(asset: asset)
        }
    }
}

// MARK: - Shared scaffolding

/// The header every non-video detail opens with: the display title with its
/// rename field, the kind chip, the learner marks the file knows (starred,
/// watched or in progress), and the actions — the star and the "Mark read"
/// press the web asset page carries.
private struct DetailHeader: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset
    /// The Ask fold's toggle binding, handed down only by the kinds Ask
    /// answers (note, diagram) — nil for every other kind.
    var asking: Binding<Bool>? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            RenameTitle(asset: asset)
            HStack(spacing: 6) {
                chip(assetKindLabel(asset.kind), systemImage: assetKindSymbol(asset.kind))
                if store.isFavorite(asset.id) {
                    chip("starred", systemImage: "star.fill")
                }
                if let mark = store.watchMark(asset.id) {
                    chip(
                        mark.done ? verb : "\(verb) to \(Self.clock(mark.seconds))",
                        systemImage: mark.done ? "checkmark.circle" : "clock"
                    )
                }
            }
            HStack(spacing: 10) {
                FavoriteButton(assetID: asset.id)
                if let asking, let subject = askSubject(of: asset.kind) {
                    AssetAskButton(asking: asking, subject: subject)
                }
                MarkDoneButton(asset: asset)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
    }

    /// The mark's word: the web's "watched" for a video, "read" for the rest.
    private var verb: String { asset.kind == "video" ? "watched" : "read" }

    private func chip(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(.quaternary, in: Capsule())
    }

    /// mm:ss for a watch mark's position.
    private static func clock(_ seconds: Double) -> String {
        let total = Int(seconds.rounded(.down))
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

/// The catalog facts — the same rows the video pane's Details box lists.
private struct DetailRows: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            row("id", asset.id)
            if let bytes = asset.bytes {
                row("size", ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file))
            }
            if let created = asset.createdAt {
                row("added", created.formatted(date: .abbreviated, time: .shortened))
            }
            if !asset.topics.isEmpty {
                row("topics", asset.topics.map { store.topics[$0]?.title ?? $0 }.joined(separator: ", "))
            }
            if !asset.concepts.isEmpty {
                row("concepts", asset.concepts.joined(separator: ", "))
            }
            if let path = asset.path {
                row("path", path, monospaced: true)
            }
            if let url = asset.url {
                row("url", url, monospaced: true)
            }
            if let key = asset.blobKey {
                row("blob", key, monospaced: true)
            }
        }
    }

    private func row(_ label: String, _ value: String, monospaced: Bool = false) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(width: 70, alignment: .trailing)
            if monospaced {
                Text(value).font(.caption.monospaced()).textSelection(.enabled)
            } else {
                Text(value).font(.callout).textSelection(.enabled)
            }
        }
    }
}

/// DetailRows under a "Details" heading, for every pane that scrolls.
private struct DetailsBox: View {
    let asset: CatalogAsset

    var body: some View {
        GroupBox("Details") {
            DetailRows(asset: asset)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
        }
    }
}

/// A timecoded list: a standalone transcript, chapter list or caption
/// track read on its own — the web's CueList, with no player to seek.
private struct CueList: View {
    let title: String
    let cues: [(start: Double, text: String)]

    var body: some View {
        GroupBox("\(title) (\(cues.count))") {
            LazyVStack(alignment: .leading, spacing: 2) {
                ForEach(Array(cues.enumerated()), id: \.offset) { _, cue in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Text(Self.timestamp(cue.start))
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                            .frame(width: 52, alignment: .trailing)
                        Text(cue.text).font(.callout)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
        }
    }

    /// mm:ss, or h:mm:ss past the hour — the way the sidecars count.
    private static func timestamp(_ seconds: Double) -> String {
        let total = Int(seconds.rounded(.down))
        let (minutes, secs) = (total / 60, total % 60)
        if minutes >= 60 {
            return String(format: "%d:%02d:%02d", minutes / 60, minutes % 60, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
}

/// The vertical layout the scrolling panes share.
private struct ScrollingPane<Content: View>: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset
    /// The Ask fold's toggle, forwarded to the header — only the askable
    /// kinds set it.
    var asking: Binding<Bool>? = nil
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                DetailHeader(asset: asset, asking: asking)
                content
                DetailsBox(asset: asset)
            }
            .padding(20)
        }
        .navigationTitle(store.displayTitle(for: asset))
    }
}

// MARK: - Sidecars

/// A standalone sidecar opened as its own asset: the blob's lines as a cue
/// list, since there is no player here to seek to them.
private struct SidecarDetail: View {
    enum Shape {
        case transcript, chapters, captions

        var title: String {
            switch self {
            case .transcript: return "Transcript"
            case .chapters: return "Chapters"
            case .captions: return "Captions"
            }
        }
    }

    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset
    let shape: Shape
    @State private var cues: [(start: Double, text: String)] = []

    private var blobURL: URL? {
        asset.blobKey.map { store.blobURL(for: $0) }
    }

    /// The blob's lines, normalized to the cue list's (start, text). Read in
    /// a task rather than in body, so a re-render does not re-read the file.
    private func loadCues() -> [(start: Double, text: String)] {
        guard let key = asset.blobKey else { return [] }
        switch shape {
        case .transcript:
            return store.transcript(blobKey: key).map { ($0.start, $0.text) }
        case .chapters:
            return store.chapters(blobKey: key).map { ($0.start, $0.title) }
        case .captions:
            return store.captions(blobKey: key).map { ($0.start, $0.text) }
        }
    }

    var body: some View {
        ScrollingPane(asset: asset) {
            if let key = asset.blobKey, store.blobExists(key) {
                CueList(title: shape.title, cues: cues)
            } else {
                MissingBlobView(expectedURL: blobURL)
                    .frame(minHeight: 160)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .task(id: asset.id) { cues = loadCues() }
    }
}

// MARK: - Note

/// A concept note: its markdown, from the linked concept row's `body`, set
/// as readable text. The web's NoteProse resolves wikilinks; those read as
/// their text here, a later wave can resolve them.
private struct NoteDetail: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset
    /// The Ask fold and its thread — the web's AskableTitle puts the same
    /// chat under this asset's title row.
    @State private var asking = false
    @State private var ask = AssetAskModel()

    var body: some View {
        ScrollingPane(asset: asset, asking: $asking) {
            if let markdown = store.noteBody(for: asset) {
                NoteBodyView(source: markdown, stripTitle: store.displayTitle(for: asset))
            } else {
                ContentUnavailableView(
                    "No body in the snapshot",
                    systemImage: "doc.questionmark",
                    description: Text("The concept row this note renders was not mirrored, or the link is missing.")
                )
            }
        }
        .inspector(isPresented: $asking) {
            AssetAskPanel(assetId: asset.id, subject: "note", model: ask)
                .inspectorColumnWidth(min: 280, ideal: 340, max: 480)
        }
        .onChange(of: asset.id) {
            asking = false
            ask = AssetAskModel()
        }
    }
}

// MARK: - Diagram

/// A stored diagram: its SVG drawn by a WKWebView on a light mat, the same
/// shape the web's DiagramView gives it. The file's text is inlined into a
/// bare page rather than loaded as a file URL, which keeps WebKit's file
/// access rules out of it entirely.
private struct DiagramDetail: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset
    @State private var svg: String?
    /// The Ask fold and its thread — the web's AskableTitle puts the same
    /// chat under this asset's title row.
    @State private var asking = false
    @State private var ask = AssetAskModel()

    var body: some View {
        ScrollingPane(asset: asset, asking: $asking) {
            if let svg {
                SVGView(svg: svg)
                    .aspectRatio(Self.aspect(of: svg), contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                MissingBlobView(expectedURL: asset.blobKey.map { store.blobURL(for: $0) })
                    .frame(minHeight: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
        .inspector(isPresented: $asking) {
            AssetAskPanel(assetId: asset.id, subject: "diagram", model: ask)
                .inspectorColumnWidth(min: 280, ideal: 340, max: 480)
        }
        .onChange(of: asset.id) {
            asking = false
            ask = AssetAskModel()
        }
        // Read in a task rather than in body, so a re-render does not
        // re-read the file.
        .task(id: asset.id) {
            svg = asset.blobKey.flatMap { store.blobText(for: $0) }
        }
    }

    /// The drawing's proportions, from its viewBox or its width/height
    /// attributes — a fixed height in a scrolling pane would either letterbox
    /// or, with no intrinsic size, collapse. 4:3 when neither says.
    private static func aspect(of svg: String) -> CGFloat {
        if let box = svg.range(of: #"viewBox="([^"]+)""#, options: .regularExpression) {
            let numbers = svg[box].dropFirst(9).dropLast()
                .split(whereSeparator: { $0 == " " || $0 == "," })
                .compactMap { Double($0) }
            if numbers.count == 4, numbers[3] > 0 {
                return CGFloat(numbers[2] / numbers[3])
            }
        }
        if let w = Self.attribute("width", in: svg),
           let h = Self.attribute("height", in: svg), h > 0 {
            return CGFloat(w / h)
        }
        return 4.0 / 3.0
    }

    private static func attribute(_ name: String, in svg: String) -> Double? {
        guard let range = svg.range(of: "\(name)=\"([0-9.]+)\"", options: .regularExpression) else {
            return nil
        }
        return Double(svg[range].dropFirst(name.count + 2).dropLast())
    }
}

/// WKWebView for an SVG string: inlined into a minimal page, so the drawing
/// renders on a white card at its own size and WebKit's pinch zoom works.
private struct SVGView: NSViewRepresentable {
    let svg: String

    /// The last svg this web view loaded; reloading only on change keeps a
    /// state-driven update from resetting the zoom.
    final class Coordinator {
        var loaded = ""
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let view = WKWebView()
        load(view, coordinator: context.coordinator)
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        load(view, coordinator: context.coordinator)
    }

    private func load(_ view: WKWebView, coordinator: Coordinator) {
        guard coordinator.loaded != svg else { return }
        coordinator.loaded = svg
        view.loadHTMLString("""
            <!doctype html><meta charset="utf-8"><style>
            html,body{margin:0;height:100%;display:grid;place-items:center;background:#f5f5f4}
            svg{max-width:96vw;max-height:96vh;background:#fff;box-shadow:0 1px 8px rgba(0,0,0,.12)}
            </style>
            \(svg)
            """, baseURL: nil)
    }
}

// MARK: - Link

/// A row with a URL and no file: there is nothing to play, so there is a
/// link — the web's LinkPanel.
private struct LinkDetail: View {
    @Environment(\.openURL) private var openURL
    let asset: CatalogAsset

    var body: some View {
        ScrollingPane(asset: asset) {
            GroupBox("On the web") {
                VStack(alignment: .leading, spacing: 10) {
                    if let raw = asset.url, let url = URL(string: raw) {
                        Button {
                            openURL(url)
                        } label: {
                            Label(
                                "Open \(URLComponents(string: raw)?.host ?? raw)",
                                systemImage: "arrow.up.right"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        Text(raw)
                            .font(.caption.monospaced())
                            .foregroundStyle(.tertiary)
                            .textSelection(.enabled)
                    } else {
                        // A link row carries no URL: a catalog bug, said so.
                        Text("This link row carries no URL.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(8)
            }
        }
    }
}

// MARK: - Poster

/// A stored still at its own size — a poster asset is nothing but the jpg.
private struct PosterDetail: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset

    var body: some View {
        ScrollingPane(asset: asset) {
            if let key = asset.blobKey, store.blobExists(key) {
                BlobImageView(url: store.blobURL(for: key))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            } else {
                MissingBlobView(expectedURL: asset.blobKey.map { store.blobURL(for: $0) })
                    .frame(minHeight: 240)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
        }
    }
}

/// A stored image decoded off the view's init, so a re-render does not
/// re-read the file.
private struct BlobImageView: View {
    let url: URL
    @State private var image: NSImage?

    var body: some View {
        Group {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                MissingBlobView(expectedURL: url).frame(minHeight: 200)
            }
        }
        .task(id: url) {
            image = await Task.detached(priority: .userInitiated) {
                NSImage(contentsOf: url)
            }.value
        }
    }
}

// MARK: - PDF

/// A stored PDF opened as an asset of its own: the same PDFKit view the
/// video's PDF pane uses. The document takes the pane, and the catalog
/// facts fold away under a disclosure since it scrolls its own pages.
private struct PDFDetail: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset

    private var pdfURL: URL? {
        asset.blobKey.map { store.blobURL(for: $0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            DetailHeader(asset: asset)
                .padding(.horizontal, 20)
                .padding(.top, 20)

            if let key = asset.blobKey, store.blobExists(key), let url = pdfURL {
                CatalogPDFView(url: url)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal, 20)
            } else {
                MissingBlobView(expectedURL: pdfURL)
                    .frame(minHeight: 240)
                    .padding(.horizontal, 20)
            }

            DisclosureGroup("Details") {
                DetailRows(asset: asset)
                    .padding(.top, 8)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 12)
        }
        .navigationTitle(store.displayTitle(for: asset))
    }
}

// MARK: - Fallback

/// The kinds whose bytes are a catalog row rather than a blob — a session
/// log, a diagram's `.tldr` — and any kind a future indexer adds. The row's
/// facts always show; a readable blob shows its text; a row whose body the
/// snapshot does not mirror says so rather than showing nothing.
private struct FallbackDetail: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset
    @State private var text: String?

    private var explanation: String {
        switch asset.kind {
        case "session":
            return "A session log's body lives in the catalog's content tables, which the snapshot does not mirror yet."
        case "diagram_source":
            return "The .tldr document lives in the catalog's content tables, which the snapshot does not mirror yet."
        default:
            return "The library has no preview for this kind yet; its catalog row is below."
        }
    }

    var body: some View {
        ScrollingPane(asset: asset) {
            if let text {
                GroupBox(asset.path?.split(separator: "/").last.map(String.init) ?? assetKindLabel(asset.kind)) {
                    Text(text)
                        .font(.caption.monospaced())
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                        .textSelection(.enabled)
                }
            } else {
                GroupBox {
                    Text(explanation)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                }
            }
        }
        // Read in a task rather than in body, so a re-render does not
        // re-read the file.
        .task(id: asset.id) {
            text = asset.blobKey.flatMap { store.blobText(for: $0) }
        }
    }
}
