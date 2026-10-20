//
//  VideoDetailView.swift
//  Gnosia
//
//  One asset's page: the player when the video's bytes are in the blob store,
//  the catalog's pdf beside it when `asset_derivation` says one was made, and
//  the row's provenance — which tool rendered it, its topics and concepts,
//  and which sidecars exist.
//

import SwiftUI

/// What the main pane shows when the video carries a pdf too.
private enum Pane: String, CaseIterable, Identifiable {
    case video = "Video"
    case pdf = "PDF"
    var id: String { rawValue }
}

struct VideoDetailView: View {
    @Environment(CatalogStore.self) private var store
    let asset: CatalogAsset

    @State private var pane: Pane = .video

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

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header

                if pane == .video {
                    if exists(videoFile), let url = videoFile {
                        PlayerView(url: url)
                            .aspectRatio(16.0 / 9.0, contentMode: .fit)
                            .frame(maxWidth: .infinity)
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
            }
            .padding(20)
        }
        .navigationTitle(asset.displayTitle)
        .onChange(of: asset.id) { pane = .video }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(asset.displayTitle).font(.title2).bold()
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
                if companions.hasCaptions { chip("captions", systemImage: "captions.bubble") }
            }
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

    private func chip(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(.quaternary, in: Capsule())
    }
}
