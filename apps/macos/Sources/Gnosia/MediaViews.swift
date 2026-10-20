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
struct PlayerView: NSViewRepresentable {
    let url: URL
    @Binding var seekTo: Double?

    func makeNSView(context: Context) -> AVPlayerView {
        let view = AVPlayerView()
        view.controlsStyle = .floating
        view.player = AVPlayer(url: url)
        view.player?.play()
        return view
    }

    func updateNSView(_ view: AVPlayerView, context: Context) {
        let current = (view.player?.currentItem?.asset as? AVURLAsset)?.url
        if current != url {
            view.player = AVPlayer(url: url)
        }
        if let seconds = seekTo {
            view.player?.seek(to: CMTime(seconds: seconds, preferredTimescale: 600))
            DispatchQueue.main.async { self.seekTo = nil }
        }
    }

    static func dismantleNSView(_ view: AVPlayerView, coordinator: ()) {
        view.player?.pause()
        view.player = nil
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
