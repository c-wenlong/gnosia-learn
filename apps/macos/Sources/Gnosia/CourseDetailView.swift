//
//  CourseDetailView.swift
//  Gnosia
//
//  A course's home, in the shape of the web app's /courses/[slug]: the
//  sidebar of modules on the left, one module in the middle (ModuleView),
//  and a rail on the right with the course's About card and the related
//  courses. /courses/[slug] and /courses/[slug]/[module] are the same page
//  on the web, one naming its module in the URL; here `moduleID` plays the
//  URL segment's part and nil lands on the first module — the web picks the
//  learner's current one, but that takes the tick state this snapshot does
//  not carry.
//

import SwiftUI

struct CourseDetailView: View {
    @Environment(CatalogStore.self) private var store
    let course: CatalogCourse
    /// The module to open on, by collection id — the [module] URL segment.
    var moduleID: String? = nil

    @State private var selected: Int = 0

    private var module: CourseModule? {
        course.modules.indices.contains(selected) ? course.modules[selected] : nil
    }

    var body: some View {
        HStack(spacing: 0) {
            sidebar
                .frame(width: 240)

            Divider()

            if let module {
                ModuleView(
                    course: course,
                    module: module,
                    index: selected,
                    onNavigate: { selected = $0 }
                )
                .id(module.id)
            } else {
                ContentUnavailableView(
                    "No modules",
                    systemImage: "rectangle.stack",
                    description: Text("This course has no modules yet.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            Divider()

            rail
                .frame(width: 280)
        }
        .navigationTitle("\(course.code) · \(course.title)")
        .onAppear {
            if let moduleID, let at = course.modules.firstIndex(where: { $0.id == moduleID || $0.slug == moduleID }) {
                selected = at
            }
        }
    }

    /// The left column: the course's code and title, then one row per module
    /// with its order and item count (the web rows also carry a status mark;
    /// that is learner state, not catalog).
    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 2) {
                Text(course.code)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Text(course.title)
                    .font(.title3).bold()
            }
            .padding(14)

            Text("Course material")
                .font(.headline)
                .padding(.horizontal, 14)
                .padding(.bottom, 4)

            List(selection: $selected) {
                ForEach(Array(course.modules.enumerated()), id: \.element.id) { index, m in
                    HStack {
                        Text("\(m.order). \(m.title)")
                            .lineLimit(2)
                        Spacer()
                        Text("\(m.items.count)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    .tag(index)
                }
            }
            .listStyle(.sidebar)
        }
    }

    /// The right rail: "About this course" (the course file's notes, track,
    /// prereq and capstone, and the inferred-syllabus callout) and "Related
    /// courses" — the two rail cards that need no learner state. The web
    /// rail's progress and next-up cards do, so they are not here.
    private var rail: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GroupBox("About this course") {
                    VStack(alignment: .leading, spacing: 10) {
                        if let notes = course.notes {
                            Text(notes).font(.callout)
                        }
                        if let track = course.track {
                            Text(track).font(.callout).foregroundStyle(.secondary)
                        }
                        if let prereq = course.prereq {
                            railRow("Prerequisites", prereq)
                        }
                        if !course.capstone.isEmpty {
                            railRow("Capstone", course.capstone)
                        }
                        if course.credits > 0 {
                            railRow("Credits", "\(course.credits)")
                        }
                        if course.inferred {
                            Label("Inferred roadmap", systemImage: "info.circle")
                                .font(.caption.bold())
                            Text("The official syllabus is not published yet; these topics are inferred and may change.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if !course.tags.isEmpty {
                            railRow("Tags", course.tags.map { store.courseTags[$0]?.label ?? $0 }.joined(separator: ", "))
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                }

                let related = store.relatedCourses(to: course)
                if !related.isEmpty {
                    GroupBox("Related courses") {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(related) { other in
                                NavigationLink(value: other) {
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text("\(other.code) \(other.title)")
                                            .font(.callout)
                                            .multilineTextAlignment(.leading)
                                        Text(other.tags.filter { course.tags.contains($0) }
                                            .map { store.courseTags[$0]?.label ?? $0 }
                                            .joined(separator: ", "))
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(8)
                    }
                }
            }
            .padding(14)
        }
        .background(.quaternary.opacity(0.25))
    }

    private func railRow(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value).font(.callout)
        }
    }
}
