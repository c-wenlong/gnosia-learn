//
//  ConceptDetailView.swift
//  Gnosia
//
//  One concept's workspace, in the shape of the web's /learn/<slug> page:
//  a header (course place eyebrow, title, the mastery dot with its
//  caption, and Teach me) over the three-panel WorkspacePanels layout —
//  the note and sources on the left, the tutor session in the centre,
//  the studio cards on the right, each column scrolling on its own and
//  the side pair folding to rails. Narrower windows get the tabbed
//  layout instead.
//
//  concept-workspace-core.ts supplies the shape. One thing the mirror
//  cannot carry: `observation` events name no concept here, so instead
//  of the web's per-concept answer history the page shows the mastery
//  row's own aggregate (which the pipeline replay stamps) and each
//  check's status matched by question text across all observations.
//
//  Teach me and the checks card's Quiz me both point at the centre
//  panel's session — learn mode and check mode respectively — rather
//  than pushing the standalone session page; that route still works
//  everywhere it did (the close screen's Keep going, Home's threads).
//

import SwiftUI

struct ConceptDetailView: View {
    @Environment(CatalogStore.self) private var store
    let concept: CatalogConcept

    /// Which panel the narrow tabbed layout shows; wide shows all three.
    /// Teach me and Quiz me put the tutor forward.
    @State private var activePanel: WorkspacePanelKey = .note
    /// The session the centre panel was asked to open — Teach me runs
    /// learn, Quiz me check. nil leaves the panel on its chat, the
    /// web workspace's default surface.
    @State private var tutorMode: SessionMode? = nil
    /// Bumped to restart the embedded walk: a new TutorPanel mounts, the
    /// way a fresh visit to the web's session page starts clean.
    @State private var tutorEpoch = 0

    private var workspace: ConceptWorkspace? {
        store.workspace(for: concept.slug)
    }

    var body: some View {
        VStack(spacing: 0) {
            if let workspace {
                header(workspace)
                    .padding(.horizontal, 20)
                    .padding(.top, 16)
                    .padding(.bottom, 12)

                WorkspacePanels(active: $activePanel) {
                    NoteSourcesPanel(w: workspace)
                } tutor: {
                    TutorPanel(slug: workspace.slug, mode: tutorMode, embedded: true)
                        .id("\(workspace.slug)\u{1f}\(tutorMode?.rawValue ?? "chat")\u{1f}\(tutorEpoch)")
                } studio: {
                    StudioPanel(w: workspace, quizMe: { startTutor(.check) })
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 16)
            } else {
                ContentUnavailableView(
                    "No workspace data",
                    systemImage: "questionmark.circle",
                    description: Text("The concept row exists but the learning tables did not load with it.")
                )
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(G.page)
        .navigationTitle(concept.title)
    }

    /// Point the centre panel at a session — mode, fresh walk, and on
    /// the narrow layout its tab forward. The web's navigation to the
    /// session page, for a session that lives in the workspace.
    private func startTutor(_ mode: SessionMode) {
        tutorMode = mode
        tutorEpoch += 1
        activePanel = .tutor
    }

    /// The page's header: the course place or the honest "not in a
    /// course yet" as the eyebrow, then title, mastery and Teach me on
    /// one row, with the frontier flag and the note's tags as the quiet
    /// line under it — the web's header block.
    @ViewBuilder
    private func header(_ w: ConceptWorkspace) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(placeEyebrow(w))
                .font(.caption.weight(.semibold))
                .foregroundStyle(G.text2)

            HStack(alignment: .center, spacing: 10) {
                Text(w.title)
                    .font(.gnosiaTitle(24))
                    .lineLimit(2)
                if w.frontier {
                    Text("On your frontier")
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(.green.opacity(0.15), in: Capsule())
                        .foregroundStyle(.green)
                }
                Spacer(minLength: 8)
                // The web's MasteryDot with its label — the bucket's dot
                // and caption in one mark.
                HStack(spacing: 6) {
                    BucketDot(bucket: w.bucket)
                    Text(masteryCaption(bucket: w.bucket, pL: w.pL))
                        .font(.caption)
                        .foregroundStyle(G.text2)
                }
                // The module path's last step, offered where the concept
                // sits on it — the web's "Module check" row: the module's
                // own check over all of its concepts.
                if let target = moduleCheckTarget(w) {
                    NavigationLink(value: target) {
                        Text("Module check")
                            .font(.callout.weight(.medium))
                            .foregroundStyle(G.text)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(G.surface, in: RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(G.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
                // The web workspace's Teach me — runs the concept
                // session (probe, teach, check) in the centre panel.
                Button { startTutor(.learn) } label: {
                    Text("Teach me")
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(G.btnText)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 7)
                        .background(G.btnFace, in: RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
            }

            // The domain is the eyebrow's already (the web prints it once).
            HStack(spacing: 8) {
                if let place = w.place {
                    NavigationLink(value: AppDestination.module(course: place.courseSlug, module: place.moduleSlug)) {
                        Text(place.label)
                            .underline()
                    }
                    .buttonStyle(.plain)
                }
                if !w.tags.isEmpty {
                    Text(w.tags.map { "#\($0)" }.joined(separator: "  "))
                }
            }
            .font(.callout)
            .foregroundStyle(G.text2)

            // The web page's caveat under Teach me when a session can ask
            // nothing. The mirror cannot see the provider keys, so the
            // honest half is the note's side: with no checks every
            // question is the tutor's to write.
            if w.checks.isEmpty {
                Text("This note has no checks: a session's questions are the tutor's to write, so nothing may be recorded.")
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
        }
    }

    /// The module this concept's place names, when it holds a concept the
    /// knowledge base can ask — the gate the web's module path puts on its
    /// check row (`taught.filter(byId.has)`), so a module with nothing to
    /// check offers no check.
    private func moduleCheckTarget(_ w: ConceptWorkspace) -> AppDestination? {
        guard
            let place = w.place,
            let course = store.course(place.courseSlug),
            let module = course.modules.first(where: { $0.slug == place.moduleSlug || $0.id == place.moduleSlug })
        else { return nil }
        var taught = Set<String>()
        for item in module.items { taught.formUnion(item.concepts) }
        guard taught.contains(where: { store.learn.byId[$0] != nil }) else { return nil }
        return .check(course: course.slug, module: module.slug)
    }

    /// The eyebrow's words — the web's `placeLabel(w.place) ?? domain ·
    /// not in a course yet`, and the place itself also sits under the
    /// title as the link it always was.
    private func placeEyebrow(_ w: ConceptWorkspace) -> String {
        if let place = w.place { return place.label }
        if let domain = w.domain { return "\(domain) · not in a course yet" }
        return "Not in a course yet"
    }
}
