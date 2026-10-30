//
//  CoursesView.swift
//  Gnosia
//
//  The courses surface: every course as a cover card in a grid, under a tag
//  filter and a search field — the shape of the web app's /courses page (a
//  compact cover card per course, the way Coursera's explore carousels look).
//  The cards carry no learner state; a module's progress ticks and notes
//  are ModuleView's, written to learner.db and mirrored through the
//  sidecar. Selecting a card pushes the course home
//  (CourseDetailView); a video anywhere under it pushes VideoDetailView.
//
//  Stands alone: CoursesView().environment(store) is a complete surface, so
//  the root composition can mount it without further wiring.
//

import ImageIO
import SwiftUI

struct CoursesView: View {
    @Environment(CatalogStore.self) private var store
    @State private var search = ""
    @State private var tag: String?

    /// The grid's filters, ported from filterCourses in
    /// apps/web/src/lib/course-summary.ts: every search word must appear in
    /// the code, the title or a tag label; the tag menu keeps whole tags.
    private var filtered: [CatalogCourse] {
        let words = search.lowercased().split(whereSeparator: { $0 == " " }).map(String.init)
        return store.courses.filter { course in
            if let tag, !course.tags.contains(tag) { return false }
            guard !words.isEmpty else { return true }
            let haystack = ([course.code, course.title] + course.tags.map { store.courseTags[$0]?.label ?? $0 })
                .joined(separator: " ")
                .lowercased()
            return words.allSatisfy { haystack.contains($0) }
        }
    }

    /// The tags any course uses, in the file's order (usedTags).
    private var usedTags: [CourseTag] {
        let used = Set(store.courses.flatMap(\.tags))
        return store.courseTagOrder.compactMap { used.contains($0) ? store.courseTags[$0] : nil }
    }

    var body: some View {
        NavigationStack {
            Group {
                if let error = store.error {
                    ContentUnavailableView {
                        Label("No catalog", systemImage: "cylinder.split.1x2")
                    } description: {
                        Text(error).font(.caption)
                    }
                } else if store.courses.isEmpty {
                    ContentUnavailableView(
                        "No courses",
                        systemImage: "books.vertical",
                        description: Text("The catalog snapshot lists no courses yet.")
                    )
                } else if filtered.isEmpty {
                    ContentUnavailableView(
                        "No match",
                        systemImage: "magnifyingglass",
                        description: Text("No course matches\(search.isEmpty ? "" : " \"\(search)\"").")
                    )
                } else {
                    grid
                }
            }
            .navigationTitle("Courses")
            .searchable(text: $search, prompt: "Search courses")
            .toolbar {
                if !usedTags.isEmpty {
                    Picker("Tag", selection: $tag) {
                        Text("All tags").tag(String?.none)
                        ForEach(usedTags) { Text($0.label).tag(String?.some($0.id)) }
                    }
                    .pickerStyle(.menu)
                }
            }
            .navigationDestination(for: CatalogCourse.self) { course in
                CourseDetailView(course: course)
            }
            .navigationDestination(for: CatalogAsset.self) { asset in
                VideoDetailView(asset: asset)
            }
        }
        .task { store.loadIfNeeded() }
    }

    /// One card per course: cover, code, title, then the counts line — the
    /// parts a web cover card prints minus the progress part, which needs the
    /// learner's ticks.
    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 240), spacing: 16)], spacing: 16) {
                ForEach(filtered) { course in
                    NavigationLink(value: course) {
                        CourseCard(course: course)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(20)
        }
    }
}

/// A compact cover card: the 16:9 cover (its blob, or the code placeholder
/// the web draws when a course has none), then the code, the title and the
/// type line ("Course · N modules · N topics" — coverLine minus progress).
private struct CourseCard: View {
    @Environment(CatalogStore.self) private var store
    let course: CatalogCourse

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            CoverArt(url: course.coverKey.map { store.blobURL(for: $0) }, code: course.code)
            VStack(alignment: .leading, spacing: 3) {
                Text(course.code)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Text(course.title)
                    .font(.headline)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text("Course · \(course.countsLine)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(.background)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(.quaternary)
        }
        .contentShape(RoundedRectangle(cornerRadius: 10))
    }
}

/// The cover blob drawn at 16:9, downsampled the way PosterThumbnail draws a
/// poster; without a key (or a missing file) the card shows the course code
/// on a tint, as the web card shows a code block.
struct CoverArt: View {
    let url: URL?
    var code: String = ""

    @State private var image: NSImage?

    var body: some View {
        ZStack {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                Rectangle().fill(.quaternary)
                Text(code)
                    .font(.title.bold())
                    .foregroundStyle(.tertiary)
            }
        }
        .aspectRatio(16.0 / 9.0, contentMode: .fit)
        .frame(maxWidth: .infinity)
        .clipped()
        .task(id: url) {
            image = nil
            guard let url else { return }
            image = await Self.thumbnail(url: url)
        }
    }

    /// Downsampled off the main actor, as PosterThumbnail's is — covers are
    /// photos, a grid of them should not decode at full size.
    private static func thumbnail(url: URL) async -> NSImage? {
        await Task.detached(priority: .utility) {
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 640,
                kCGImageSourceCreateThumbnailWithTransform: true,
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
                return nil
            }
            return NSImage(cgImage: cg, size: .zero)
        }.value
    }
}
