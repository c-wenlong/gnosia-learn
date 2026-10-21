//
//  MediaViews.swift
//  Gnosia
//
//  The AppKit-backed media surfaces SwiftUI does not give us, and the cheap
//  thumbnail. SwiftUI's own VideoPlayer is deliberately not used: AVPlayerView
//  (AppKit) gives the real transport, chapters and picture-in-picture for
//  free, and wrapping it is twenty lines.
//

import AppKit
import AVKit
import ImageIO
import PDFKit
import SwiftUI

/// AVPlayerView under SwiftUI: a file URL in, the standard transport out.
/// The player lives on the view, so re-selection of the same asset keeps the
/// position and switching assets calls updateNSView with a new URL.
/// `seekTo` is a one-shot channel: set it to a time in seconds and the player
/// goes there, the way the web player's transcript and chapter taps seek.
///
/// The web player posts where the learner is every fifteen seconds of play,
/// on pause, at the end and when the page is left (LibraryVideo.tsx); here
/// `onPosition` is the same heartbeat — (position, duration) in seconds —
/// driven by a timer while playing, by the pause and end edges, and once
/// more from dismantle, and `resumeAt` is the start offset a returning
/// learner gets (the web's resumeAt rule applied by the caller).
struct PlayerView: NSViewRepresentable {
    let url: URL
    @Binding var seekTo: Double?
    /// Where playback starts; 0 is the top. Applied on open and on a URL
    /// swap, which is the detail pane's version of a page navigation.
    var resumeAt: Double = 0
    var onPosition: @MainActor (Double, Double) -> Void = { _, _ in }
    /// The live playhead in seconds, about once a second by default — far
    /// finer than the heartbeat above, which lags up to fifteen seconds.
    /// The detail pane reads it for Ask's `at`, so a mid-watch question
    /// grounds at where the learner actually is rather than the last save,
    /// and for the captions overlay, which wants a tick fine enough for a
    /// cue boundary to land when the line is said.
    var onPlayhead: @MainActor (Double) -> Void = { _ in }
    /// `onPlayhead`'s cadence in seconds. The default keeps the tick cheap;
    /// a caption layer asks for a quarter-second so a cue switch is never a
    /// full second off the words.
    var playheadInterval: Double = 1

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> AVPlayerView {
        let view = AVPlayerView()
        view.controlsStyle = .floating
        view.player = AVPlayer(url: url)
        context.coordinator.arm(view, onPosition: onPosition, onPlayhead: onPlayhead, every: playheadInterval)
        if resumeAt > 0 {
            view.player?.seek(to: CMTime(seconds: resumeAt, preferredTimescale: 600))
        }
        view.player?.play()
        return view
    }

    func updateNSView(_ view: AVPlayerView, context: Context) {
        let current = (view.player?.currentItem?.asset as? AVURLAsset)?.url
        if current != url {
            // The outgoing asset's last position lands before the swap,
            // under the old onPosition — the way the web page's exit save
            // does; only then does the new player get its heartbeat and
            // resume point.
            context.coordinator.report(view)
            context.coordinator.disarm()
            view.player = AVPlayer(url: url)
            context.coordinator.arm(view, onPosition: onPosition, onPlayhead: onPlayhead, every: playheadInterval)
            if resumeAt > 0 {
                view.player?.seek(to: CMTime(seconds: resumeAt, preferredTimescale: 600))
            }
        }
        context.coordinator.onPosition = onPosition
        context.coordinator.onPlayhead = onPlayhead
        if let seconds = seekTo {
            view.player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
            DispatchQueue.main.async { self.seekTo = nil }
        }
    }

    static func dismantleNSView(_ view: AVPlayerView, coordinator: Coordinator) {
        coordinator.report(view)
        coordinator.disarm()
        view.player?.pause()
        view.player = nil
    }

    /// The heartbeat's owner: a 15-second timer that fires only while the
    /// player is playing, plus the pause and end edges. report() is where a
    /// save-worthy position leaves. Everything lands on the main actor —
    /// the timer is the main runloop's, the observers are the main queue's.
    @MainActor
    final class Coordinator {
        var onPosition: (Double, Double) -> Void = { _, _ in }
        var onPlayhead: (Double) -> Void = { _ in }
        private var timer: Timer?
        private var endObserver: NSObjectProtocol?
        private var pauseObservation: NSKeyValueObservation?
        /// The periodic observer the per-second playhead tick comes from;
        /// its player is kept beside the token because removing it is that
        /// player's call.
        private var playheadObserver: (player: AVPlayer, token: Any)?

        /// The playhead and the item's length, told to onPosition when both
        /// are known — a video still loading has nothing to write yet.
        func report(_ view: AVPlayerView) {
            guard let player = view.player, let item = player.currentItem else { return }
            let position = player.currentTime().seconds
            let duration = item.duration.seconds
            guard position.isFinite, duration.isFinite, duration > 0 else { return }
            onPosition(position, duration)
        }

        /// Point every edge at the player the view holds now; the timer is
        /// (re)started rather than shared so a stale one never reports.
        func arm(
            _ view: AVPlayerView,
            onPosition: @escaping @MainActor (Double, Double) -> Void,
            onPlayhead: @escaping @MainActor (Double) -> Void,
            every interval: Double = 1
        ) {
            self.onPosition = onPosition
            self.onPlayhead = onPlayhead
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self, weak view] _ in
                guard let view, (view.player?.rate ?? 0) > 0 else { return }
                MainActor.assumeIsolated { self?.report(view) }
            }
            endObserver.map(NotificationCenter.default.removeObserver)
            endObserver = nil
            pauseObservation?.invalidate()
            pauseObservation = nil
            if let playheadObserver {
                playheadObserver.player.removeTimeObserver(playheadObserver.token)
                self.playheadObserver = nil
            }
            guard let player = view.player else { return }
            // A periodic observer over the caller's tick: it also reports
            // the paused seeks a timer would miss, and costs nothing while
            // the player is idle.
            playheadObserver = (
                player,
                player.addPeriodicTimeObserver(
                    forInterval: CMTime(seconds: interval, preferredTimescale: 600),
                    queue: .main
                ) { [weak self] time in
                    let seconds = time.seconds
                    guard seconds.isFinite else { return }
                    MainActor.assumeIsolated { self?.onPlayhead(seconds) }
                }
            )
            endObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime, object: player.currentItem, queue: .main
            ) { [weak self, weak view] _ in
                guard let view else { return }
                MainActor.assumeIsolated { self?.report(view) }
            }
            pauseObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self, weak view] player, _ in
                guard player.timeControlStatus == .paused, let view else { return }
                MainActor.assumeIsolated { self?.report(view) }
            }
        }

        func disarm() {
            timer?.invalidate()
            timer = nil
            endObserver.map(NotificationCenter.default.removeObserver)
            endObserver = nil
            pauseObservation?.invalidate()
            pauseObservation = nil
            if let playheadObserver {
                playheadObserver.player.removeTimeObserver(playheadObserver.token)
                self.playheadObserver = nil
            }
        }
    }
}

/// A PDF from the blob store, drawn by PDFKit. The document loads off the
/// view's init so a re-render does not re-read the file.
struct CatalogPDFView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.document = PDFDocument(url: url)
        return view
    }

    func updateNSView(_ view: PDFView, context: Context) {
        if view.document?.documentURL != url {
            view.document = PDFDocument(url: url)
        }
    }
}

/// A poster jpg drawn at 16:9, filling the width it is offered and
/// cropping the overflow. ImageIO downsamples to `maxPixel` (a decode
/// ceiling, not a display size) rather than decoding the video-sized file
/// at full size.
struct PosterThumbnail: View {
    let url: URL?
    var maxPixel: CGFloat = 512
    var cornerRadius: CGFloat = 10

    @State private var image: NSImage?

    var body: some View {
        Color.clear
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .overlay {
                if let image {
                    Image(nsImage: image)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                } else {
                    Rectangle()
                        .fill(.quaternary)
                        .overlay {
                            Image(systemName: "play.rectangle")
                                .foregroundStyle(.tertiary)
                        }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .task(id: url) {
                guard let url else { return }
                image = await Self.thumbnail(url: url, maxPixel: maxPixel)
            }
    }

    private static func thumbnail(url: URL, maxPixel: CGFloat) async -> NSImage? {
        await Task.detached(priority: .utility) {
            let options: [CFString: Any] = [kCGImageSourceShouldCache: false]
            guard let source = CGImageSourceCreateWithURL(url as CFURL, options as CFDictionary) else {
                return nil
            }
            let thumb: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: Int(maxPixel),
                kCGImageSourceCreateThumbnailWithTransform: true,
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, thumb as CFDictionary) else {
                return nil
            }
            return NSImage(cgImage: cg, size: NSSize(width: cg.width, height: cg.height))
        }.value
    }
}

/// The caption a playhead at `time` hears — subtitleAt in
/// packages/tutor/src/media.ts, minus its chunking: a `.vtt` cue is already
/// caption-sized (the web chunks transcript.json's paragraph-long segments
/// for the same overlay). The cue whose span holds the playhead; when two
/// cues overlap, the later start wins, as the web's does. A cue with no end
/// runs to the next one or forever.
func captionAt(_ cues: [CaptionCue], _ time: Double) -> CaptionCue? {
    var best: CaptionCue?
    for cue in cues where cue.start <= time && time < (cue.end ?? .infinity) {
        if best == nil || cue.start >= best!.start { best = cue }
    }
    return best
}

/// A missing-blob placeholder with the same frame as the player.
struct MissingBlobView: View {
    let expectedURL: URL?

    var body: some View {
        ContentUnavailableView {
            Label("Bytes not in the blob store", systemImage: "externaldrive.badge.questionmark")
        } description: {
            Text(expectedURL?.path ?? "this asset has no blob_key")
                .font(.caption.monospaced())
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.black.opacity(0.85))
    }
}
