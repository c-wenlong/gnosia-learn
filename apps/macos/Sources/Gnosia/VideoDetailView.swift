//
//  VideoDetailView.swift
//  Gnosia
//
//  One asset's page: the player when the video's bytes are in the blob
//  store — with its `.vtt` captions on a CC toggle, as the web player's
//  subtitle layer draws them — the catalog's pdf beside it when
//  `asset_derivation` says one was made, and the row's provenance — which
//  tool rendered it, its topics and concepts, and which sidecars exist.
//

import SwiftUI

/// What the main pane shows when the video carries a pdf too.
private enum Pane: String, CaseIterable, Identifiable {
    case video = "Video"
    case pdf = "PDF"
    var id: String { rawValue }
}

/// The mutable holder the player's quarter-second tick writes through.
/// @Observable rather than a plain box so a reader (the caption line)
/// re-renders on the tick while the page holding it does not.
@Observable
private final class LivePlayhead {
    var seconds = 0.0
}

/// The caption over the picture — the web player's subtitle line: the cue
/// being spoken, bottom-centre on a black scrim, untappable so the player
/// under it keeps its clicks. Reads the playhead through `live` so the
/// quarter-second tick re-renders this line alone.
private struct CaptionLine: View {
    let cues: [CaptionCue]
    let live: LivePlayhead

    var body: some View {
        if let cue = captionAt(cues, live.seconds) {
            Text(cue.text)
                .font(.callout.weight(.medium))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 6))
                // Clears the transport when the floating controls show —
                // the web's caption rides to the same height then.
                .padding(.bottom, 44)
                .padding(.horizontal, 40)
        }
    }
}

struct VideoDetailView: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner: LearnerStore?
    let asset: CatalogAsset

    @State private var pane: Pane = .video
    @State private var seekTo: Double?
    @State private var chapters: [VideoChapter] = []
    @State private var transcript: [TranscriptSegment] = []
    /// The `.vtt` cues and whether they draw over the picture — the web
    /// player's CC toggle, off at open as the web's is (its choice is
    /// remembered per browser; here it is per viewing).
    @State private var cues: [CaptionCue] = []
    @State private var captionsOn = false
    /// The last position the player reported; what "Mark watched" stamps.
    @State private var playhead: Double = 0
    /// The inspector's Ask fold and the thread it is holding.
    @State private var asking = false
    @State private var ask = AssetAskModel()
    /// The quarter-second playhead for Ask's `at` and the captions — a
    /// box rather than plain state, so the tick re-renders only the view
    /// that reads it.
    @State private var live = LivePlayhead()

    private var companions: VideoCompanions { store.companions(for: asset.id) }

    private var videoFile: URL? {
        asset.blobKey.map { store.blobURL(for: $0) }
    }

    private var pdfFile: URL? {
        companions.pdfKey.map { store.blobURL(for: $0) }
    }

    private func exists(_ url: URL?) -> Bool {
        url.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    }

    /// Where the player opens: the watch row's position, except a finished
    /// video starts over (the web's RESUME_TAIL rule — resumeAt in
    /// playback.ts) and a barely started one needs no resume
    /// (RESUME_HEAD_SECONDS).
    private var resumePoint: Double {
        guard let mark = store.watchMark(asset.id), !mark.done, mark.seconds >= 5 else { return 0 }
        return mark.seconds
    }

    /// The heartbeat's write: position into the `watch` row, `done` once the
    /// playhead crosses watchedFraction of the duration — the web's coverage
    /// rule approximated by position, since this app does not track ranges.
    /// Done is sticky: a later partial position never un-watches.
    private func save(position: Double, duration: Double) {
        let done = (learner?.watchEntry(for: asset.id)?.done ?? false)
            || position >= watchedFraction * duration
        learner?.setWatch(asset.id, seconds: position, done: done, mirror: .position(duration: duration))
        playhead = position
        store.refreshLearner()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header

                if pane == .video {
                    if exists(videoFile), let url = videoFile {
                        PlayerView(
                            url: url,
                            seekTo: $seekTo,
                            resumeAt: resumePoint,
                            onPosition: { position, duration in
                                save(position: position, duration: duration)
                            },
                            onPlayhead: { seconds in
                                live.seconds = seconds
                            },
                            // The caption tick: a cue switch should land
                            // within a quarter-second of the words.
                            playheadInterval: 0.25
                        )
                            .aspectRatio(16.0 / 9.0, contentMode: .fit)
                            .frame(maxWidth: .infinity)
                            // The caption line over the picture, as the web
                            // player's CC layer draws it.
                            .overlay(alignment: .bottom) {
                                if captionsOn {
                                    CaptionLine(cues: cues, live: live)
                                }
                            }
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    } else {
                        MissingBlobView(expectedURL: videoFile)
                            .aspectRatio(16.0 / 9.0, contentMode: .fit)
                    }
                } else if exists(pdfFile), let url = pdfFile {
                    CatalogPDFView(url: url)
                        .frame(minHeight: 480)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                } else {
                    MissingBlobView(expectedURL: pdfFile)
                        .frame(minHeight: 240)
                }

                details

                if !chapters.isEmpty { chapterList }
                if !transcript.isEmpty { transcriptList }
            }
            .padding(20)
        }
        .navigationTitle(store.displayTitle(for: asset))
        // Ask lives in the trailing inspector column: the player stays on
        // screen while the chat runs, where a sheet would cover it.
        .inspector(isPresented: $asking) {
            AssetAskPanel(
                assetId: asset.id,
                subject: "video",
                position: { live.seconds },
                model: ask
            )
            .inspectorColumnWidth(min: 280, ideal: 340, max: 480)
        }
        .onChange(of: asset.id) {
            pane = .video
            playhead = 0
            asking = false
            captionsOn = false
            ask = AssetAskModel()
            live.seconds = 0
        }
        .task(id: asset.id) {
            chapters = store.chapters(for: asset.id)
            transcript = store.transcript(for: asset.id)
            cues = store.captions(for: asset.id)
            // Seed Ask's `at` with the resume point — a question asked
            // before the first tick still lands where playback starts.
            live.seconds = resumePoint
        }
    }

    /// The chapter list a `.chapters.json` sidecar gives: the same taps the
    /// web player's scrub-bar marks answer to.
    private var chapterList: some View {
        GroupBox("Chapters") {
            LazyVStack(alignment: .leading, spacing: 2) {
                ForEach(Array(chapters.enumerated()), id: \.offset) { _, chapter in
                    Button { seekTo = chapter.start } label: {
                        HStack(spacing: 10) {
                            Text(Self.timestamp(chapter.start))
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                                .frame(width: 52, alignment: .trailing)
                            Text(chapter.title).font(.callout)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
        }
    }

    /// The transcript a `.transcript.json` sidecar gives, line by line with
    /// the moment it is said — tapping a line seeks, as the web page's does.
    private var transcriptList: some View {
        GroupBox("Transcript") {
            LazyVStack(alignment: .leading, spacing: 2) {
                ForEach(Array(transcript.enumerated()), id: \.offset) { _, segment in
                    Button { seekTo = segment.start } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Text(Self.timestamp(segment.start))
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                                .frame(width: 52, alignment: .trailing)
                            Text(segment.text).font(.callout)
                        }
                    }
                    .buttonStyle(.plain)
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

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                RenameTitle(asset: asset)
                Spacer()
                if pdfFile != nil {
                    Picker("Pane", selection: $pane) {
                        ForEach(Pane.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .frame(width: 160)
                }
            }

            HStack(spacing: 6) {
                chip(asset.generatedBy, systemImage: "hammer")
                chip(asset.sourceRepo, systemImage: "shippingbox")
                if companions.hasTranscript { chip("transcript", systemImage: "text.bubble") }
                if companions.hasChapters { chip("chapters", systemImage: "list.bullet") }
                if companions.hasCaptions {
                    // The web player's CC button: toggles the caption line
                    // over the picture, tinted while it is on.
                    Button { captionsOn.toggle() } label: {
                        chip("captions", systemImage: "captions.bubble", on: captionsOn)
                    }
                    .buttonStyle(.plain)
                    .help("Toggle captions")
                }
            }

            // The web watch page's action pills: the star, Ask and the mark.
            HStack(spacing: 10) {
                FavoriteButton(assetID: asset.id)
                AssetAskButton(asking: $asking, subject: "video")
                MarkDoneButton(asset: asset, seconds: playhead)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
    }

    private var details: some View {
        GroupBox("Details") {
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
                if let key = asset.blobKey {
                    row("blob", key, monospaced: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(8)
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

    private func chip(_ text: String, systemImage: String, on: Bool = false) -> some View {
        Label(text, systemImage: systemImage)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(on ? AnyShapeStyle(G.tint) : AnyShapeStyle(.quaternary), in: Capsule())
            .foregroundStyle(on ? G.accentText : .primary)
    }
}
