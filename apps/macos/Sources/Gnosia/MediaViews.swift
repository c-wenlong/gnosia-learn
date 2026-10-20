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

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> AVPlayerView {
        let view = AVPlayerView()
        view.controlsStyle = .floating
        view.player = AVPlayer(url: url)
        context.coordinator.arm(view, onPosition: onPosition)
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
            context.coordinator.arm(view, onPosition: onPosition)
            if resumeAt > 0 {
                view.player?.seek(to: CMTime(seconds: resumeAt, preferredTimescale: 600))
            }
        }
        context.coordinator.onPosition = onPosition
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
        private var timer: Timer?
        private var endObserver: NSObjectProtocol?
        private var pauseObservation: NSKeyValueObservation?

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
        func arm(_ view: AVPlayerView, onPosition: @escaping @MainActor (Double, Double) -> Void) {
            self.onPosition = onPosition
            timer?.invalidate()
            timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self, weak view] _ in
                guard let view, (view.player?.rate ?? 0) > 0 else { return }
                MainActor.assumeIsolated { self?.report(view) }
            }
            endObserver.map(NotificationCenter.default.removeObserver)
            endObserver = nil
            pauseObservation?.invalidate()
            pauseObservation = nil
            guard let player = view.player else { return }
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

/// A poster jpg as a thumbnail, downsampled by ImageIO rather than decoded at
/// full size — poster files are video-sized and a row only needs a chip.
struct PosterThumbnail: View {
    let url: URL?
    var maxPixel: CGFloat = 96

    @State private var image: NSImage?

    var body: some View {
        Group {
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
        .frame(width: maxPixel * 16 / 9, height: maxPixel)
        .clipShape(RoundedRectangle(cornerRadius: 6))
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
                kCGImageSourceThumbnailMaxPixelSize: Int(maxPixel * 2), // retina
                kCGImageSourceCreateThumbnailWithTransform: true,
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, thumb as CFDictionary) else {
                return nil
            }
            return NSImage(cgImage: cg, size: NSSize(width: cg.width / 2, height: cg.height / 2))
        }.value
    }
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
