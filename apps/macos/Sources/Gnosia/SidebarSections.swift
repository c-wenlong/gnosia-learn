//
//  SidebarSections.swift
//  Gnosia
//
//  The sidebar under the destinations, the web's Sections.tsx drawn
//  natively: Courses — the courses the owner has opened, each opening
//  where they left off; Pinned — the `pinned` preference's rows, once one
//  exists; and Recent — what the owner was last in, newest first under
//  the day headings (`recentGroups`). The model is `sidebarRecent` in
//  LearnModel.swift; navigation is a callback so the rows carry no
//  routing of their own.
//
//  The pieces the web draws that the data here cannot support stay out:
//  the row's "more" menu (Pin, Rename — no native write), the pending
//  conversation row (the runner's drafts live inside StudioView), and
//  Show older (the local list is already whole).
//

import SwiftUI

struct SidebarSections: View {
    let model: SidebarModel
    /// The destination the detail column is showing — the current row's fill.
    let current: AppDestination?
    /// A row's link: its destination pushed on the owning surface.
    var open: (AppDestination) -> Void
    /// The one link no destination names (`/studio…`) — the section instead.
    var openStudio: () -> Void
    /// The Courses section's "+", the web's Browse-courses link.
    var browseCourses: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            coursesSection
            if !model.pinned.isEmpty {
                pinnedSection
            }
            recentSection
        }
    }

    // MARK: - Courses

    private var coursesSection: some View {
        VStack(alignment: .leading, spacing: 1) {
            SidebarLabel("Courses") {
                Button(action: browseCourses) {
                    Image(systemName: "plus")
                        .font(.caption)
                        .foregroundStyle(G.text3)
                        .frame(width: 20, height: 20)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .help("Browse courses")
            }

            if model.courses.isEmpty {
                Text("Courses you open show here.")
                    .font(.callout)
                    .foregroundStyle(G.text3)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 8)
            }
            ForEach(model.courses) { course in
                courseRow(course)
            }
        }
        .padding(.bottom, 6)
    }

    /// One course row: the folder glyph, "CODE Title" on the first line and
    /// the module visited last under it — the web's two-line row.
    private func courseRow(_ course: SidebarCourse) -> some View {
        let here = isCurrent(course)
        return Button { open(course.destination) } label: {
            HStack(spacing: 9) {
                Image(systemName: "folder")
                    .font(.callout)
                    .frame(width: 18, alignment: .center)
                VStack(alignment: .leading, spacing: 1) {
                    (Text(course.code).foregroundStyle(G.text2)
                        + Text(" \(course.title)").foregroundStyle(G.text))
                        .font(.callout)
                        .lineLimit(1)
                    if let resume = course.resume {
                        Text("\(resume.order). \(resume.title)")
                            .font(.caption)
                            .foregroundStyle(G.text3)
                            .lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, course.resume == nil ? 6 : 4)
            .background(here ? G.surface2 : .clear, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        // Any page of the course: the row is where the owner is.
        .help(course.resume == nil
              ? "\(course.code) \(course.title)"
              : "\(course.code) \(course.title), \(course.resume!.order). \(course.resume!.title)")
    }

    /// The web highlights the course row on any page of the course.
    private func isCurrent(_ course: SidebarCourse) -> Bool {
        switch current {
        case .course(let slug), .module(let slug, _), .check(let slug, _):
            return slug == course.slug
        default:
            return false
        }
    }

    // MARK: - Pinned

    private var pinnedSection: some View {
        VStack(alignment: .leading, spacing: 1) {
            SidebarLabel("Pinned")
            ForEach(model.pinned) { pin in
                recentRow(
                    symbol: recentSymbol(pin.kind),
                    title: pin.title,
                    current: pin.destination != nil && pin.destination == current
                ) {
                    if let destination = pin.destination { open(destination) }
                    else if pin.opensStudio { openStudio() }
                }
            }
        }
        .padding(.bottom, 6)
    }

    // MARK: - Recent

    private var recentSection: some View {
        VStack(alignment: .leading, spacing: 1) {
            SidebarLabel("Recent")
            if model.groups.isEmpty {
                Text("Modules, videos, conversations and concepts you open show here.")
                    .font(.callout)
                    .foregroundStyle(G.text3)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 8)
            }
            ForEach(model.groups) { group in
                VStack(alignment: .leading, spacing: 1) {
                    Text(group.label)
                        .font(.caption)
                        .foregroundStyle(G.text3)
                        .padding(.horizontal, 8)
                        .padding(.top, 6)
                        .padding(.bottom, 3)
                    ForEach(group.rows) { item in
                        recentRow(
                            symbol: recentSymbol(item),
                            title: item.title,
                            current: item.destination == current
                        ) {
                            open(item.destination)
                        }
                    }
                }
            }
        }
        .padding(.bottom, 6)
    }

    /// The glyph each Recent kind carries — RECENT_GLYPHS in rows.ts: a
    /// module its book, a video its play button, a draft the compose
    /// glyph, a concept the bulb, a tutor session the chat bubble. A
    /// course page visited with no module open is still the book.
    private func recentSymbol(_ item: RecentItem) -> String {
        recentSymbol(item.kind, isCourseVisit: item.kind == .module && item.moduleSlug == nil)
    }

    private func recentSymbol(_ kind: RecentItem.Kind, isCourseVisit: Bool = false) -> String {
        switch kind {
        case .module: return isCourseVisit ? "book" : "book.closed"
        case .video: return "play.rectangle"
        case .draft: return "square.and.pencil"
        case .concept: return "lightbulb"
        case .session: return "bubble.left.and.bubble.right"
        }
    }

    /// One recent row: glyph and one-line title on the row face the nav
    /// rows draw, the current one resting on surface2.
    private func recentRow(symbol: String, title: String, current: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Image(systemName: symbol)
                    .font(.callout)
                    .frame(width: 18, alignment: .center)
                Text(title)
                    .font(.callout)
                    .lineLimit(1)
            }
            .foregroundStyle(current ? G.text : G.text2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(current ? G.surface2 : .clear, in: RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .help(title)
    }
}

/// A section's 13px grey label — SectionLabel in Sections.tsx, the row
/// height's own padding, with the optional action (the Courses "+")
/// parked at its right.
private struct SidebarLabel<Action: View>: View {
    let title: String
    let action: Action?

    init(_ title: String, @ViewBuilder action: () -> Action) {
        self.title = title
        self.action = action()
    }

    var body: some View {
        HStack {
            Text(title)
                .font(.callout.weight(.medium))
                .foregroundStyle(G.text3)
            Spacer(minLength: 0)
            action
        }
        .padding(.horizontal, 8)
        .padding(.top, 10)
        .padding(.bottom, 4)
    }
}

extension SidebarLabel where Action == EmptyView {
    init(_ title: String) {
        self.title = title
        self.action = nil
    }
}

// MARK: - The account row

/// The account row at the foot of the sidebar — AccountMenu.tsx. The web
/// names the signed-in learner and draws their sprite; this app keeps no
/// profile of its own, so the Mac account's full name stands in and the
/// head-and-shoulders glyph is the avatar the web falls back to when the
/// sprite is unknown. The menu it opens holds the Settings pane — the
/// web's Theme switch is the system's own appearance here, and there is
/// no sign-in to sign out of.
struct SidebarAccountRow: View {
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        Menu {
            Button {
                openSettings()
            } label: {
                Label("Settings…", systemImage: "gear")
            }
        } label: {
            HStack(spacing: 9) {
                Image(systemName: "person.fill")
                    .font(.callout)
                    .foregroundStyle(G.text2)
                    .frame(width: 26, height: 26)
                    .background(G.surface2, in: Circle())
                Text(SidebarAccountRow.ownerName)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.text)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption2)
                    .foregroundStyle(G.text3)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize(horizontal: false, vertical: true)
    }

    /// The Mac account's full name, "Account" when the system has none —
    /// the web's `display_name ?? "Account"`, read from the one profile
    /// the machine does keep.
    private static var ownerName: String {
        let name = NSFullUserName().trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? "Account" : name
    }
}
