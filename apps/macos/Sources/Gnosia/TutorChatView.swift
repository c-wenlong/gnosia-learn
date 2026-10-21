//
//  TutorChatView.swift
//  Gnosia
//
//  The workspace Tutor panel's resting surface — the web's
//  apps/web/src/components/workspace/TutorChat.tsx drawn natively: a
//  freeform chat with the concept tutor, `POST /api/agent/chat` with
//  `conceptSlug` through the sidecar's copy of the same route.
//
//  The contract is the web's. An empty thread shows the welcome turn —
//  "Ask me anything about X. I answer from your note and cite it as
//  [1], and I will check you as we go." — with the [1] chip naming the
//  note. `[n]` markers in a reply become chips against the numbered
//  source list the prompt gave the model (the note first, the note's
//  `sources:` after it); a number the list does not have stays text.
//  Three suggestion chips sit under the thread, and the composer is the
//  merged @ field, completing concepts and assets as words to the
//  tutor. Tutor turns render markdown through ChatMarkdownView (the
//  web's NoteProse in TutorMessage); learner turns stay literal text
//  with maths (its MathText in UserMessage).
//
//  Where the native split differs from the web's, by design: "Give me a
//  check" leaves the chat for the structured session — the graded walk
//  TutorPanel swaps in — where the web sends the words to the tutor and
//  lets its CHECK: machinery grade the answer in the thread. A check
//  the tutor asks mid-chat here is conversation, not evidence; the
//  graded path is the session. The thread itself is in-memory (the
//  web's is sessionStorage): kept while the panel is mounted, gone with
//  it, which is what the web's per-tab store already promised.
//

import AppKit
import SwiftUI

// MARK: - The rules, ported from the web

/// One entry of the numbered list the tutor cites as `[n]` — the web's
/// `CitationSource`: the note is always [1], the note's `sources:`
/// frontmatter follows from [2]. `href` only when the chip has somewhere
/// to go — natively that means a web source's URL; the note's own
/// `/learn/<slug>` link is the page the panel already stands on, so it
/// carries none.
struct TutorCitationSource: Equatable {
    let n: Int
    let label: String
    let href: String?
}

/// `conceptCitationSources` from lib/agent/prompt.ts.
func tutorCitationSources(title: String, sources: [String]) -> [TutorCitationSource] {
    var out = [TutorCitationSource(n: 1, label: "Your note: \(title)", href: nil)]
    for (i, source) in sources.enumerated() {
        let web = source.hasPrefix("https://") || source.hasPrefix("http://")
        out.append(TutorCitationSource(n: i + 2, label: source, href: web ? source : nil))
    }
    return out
}

/// One suggestion chip under the thread — `conceptSuggestedQuestions`
/// from lib/agent/prompt.ts. `check` marks the chip that opens the
/// structured session rather than sending its words.
struct TutorSuggestion: Equatable, Identifiable {
    let text: String
    let check: Bool
    var id: String { text }
}

func tutorSuggestedQuestions(title: String, observations: Int, firstRequires: String?) -> [TutorSuggestion] {
    [
        TutorSuggestion(
            text: observations == 0 ? "What is \(title), in one line?" : "Where do people usually go wrong?",
            check: false
        ),
        TutorSuggestion(
            text: firstRequires.map { "How does it build on \($0.lowercased())?" } ?? "Show me a worked example",
            check: false
        ),
        TutorSuggestion(text: "Give me a check", check: true),
    ]
}

/// `[n]` and `[n, m]` groups inside a reply — citedNumbers' pattern
/// from lib/tutor-thread.ts.
private let citeMarker = try! NSRegularExpression(pattern: #"\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]"#)

/// `citedNumbers`: the distinct source numbers a reply cites, in
/// first-use order, keeping only those the list has — a number it does
/// not have is the model being wrong, not a chip to draw.
func tutorCitedNumbers(_ text: String, known: Set<Int>) -> [Int] {
    let ns = text as NSString
    var out: [Int] = []
    for match in citeMarker.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
        for part in ns.substring(with: match.range(at: 1)).split(separator: ",") {
            if let n = Int(part.trimmingCharacters(in: .whitespaces)),
               known.contains(n), !out.contains(n) {
                out.append(n)
            }
        }
    }
    return out
}

/// `trimForRequest`: the thread's tail that fits the chat route's
/// payload bounds — 30 turns and 20,000 characters with room to spare,
/// the kept tail always starting on a learner turn so the model never
/// sees a reply to nothing.
func tutorRequestTurns(_ turns: [SidecarClient.ChatMessage]) -> [SidecarClient.ChatMessage] {
    var kept: [SidecarClient.ChatMessage] = []
    var chars = 0
    for turn in turns.reversed() {
        if kept.count >= 30 { break }
        if !kept.isEmpty && chars + turn.content.count > 20_000 { break }
        kept.insert(turn, at: 0)
        chars += turn.content.count
    }
    while kept.count > 1 && kept[0].role != "user" { kept.removeFirst() }
    return kept
}

/// `tutorStyleLabel` — the `tutorStyle` preference's label, the four
/// styles of TUTOR_STYLES in lib/preferences.ts.
func tutorStyleLabel(_ preferences: [String: String]) -> String {
    let labels: [String: String] = [
        "guide-concise": "Learning guide · concise",
        "guide-detailed": "Learning guide · detailed",
        "socratic": "Socratic · questions first",
        "direct": "Direct · answers first",
    ]
    return labels[preferences["tutorStyle"] ?? "guide-concise"] ?? "Learning guide · concise"
}

// MARK: - The chat

struct TutorChatView: View {
    @Environment(CatalogStore.self) private var store
    @Environment(SidecarManager.self) private var sidecar

    /// The concept the tutor works on.
    let slug: String
    /// A check chip's way into the structured session — the panel's own
    /// surface swap. `.check` is the note's checks in turn (Quiz me).
    var onSession: (SessionMode) -> Void

    // The workspace-derived context, read once as the session's plan is.
    @State private var ready = false
    @State private var missing = false
    @State private var title = ""
    @State private var sources: [TutorCitationSource] = []
    @State private var suggestions: [TutorSuggestion] = []

    // The thread and its field.
    @State private var turns: [SidecarClient.ChatMessage] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var error: String? = nil
    @FocusState private var composerFocused: Bool

    /// The source list as a lookup — the web's `byNumber` map.
    private var byNumber: [Int: TutorCitationSource] {
        Dictionary(uniqueKeysWithValues: sources.map { ($0.n, $0) })
    }

    /// The last tutor turn's index — its Why? button's place.
    private var lastTutor: Int? {
        turns.lastIndex { $0.role == "assistant" }
    }

    var body: some View {
        Group {
            if missing {
                ContentUnavailableView(
                    "No workspace data",
                    systemImage: "questionmark.circle",
                    description: Text("The knowledge base has no workspace for “\(slug)” to answer questions from.")
                )
            } else if ready {
                chat
            } else {
                ContentUnavailableView {
                    ProgressView()
                } description: {
                    Text("Loading the tutor…").font(.callout)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task { prepare() }
        .onChange(of: store.loaded) { _, _ in prepare() }
    }

    /// The title, source list and suggestions from the workspace — the
    /// server half of the web's page (its `buildConceptSessionContext`
    /// inputs) read from the catalog.
    private func prepare() {
        guard !ready, store.loaded else { return }
        guard let w = store.workspace(for: slug) else {
            if store.loaded { missing = true }
            return
        }
        title = w.title
        sources = tutorCitationSources(title: w.title, sources: w.sources)
        suggestions = tutorSuggestedQuestions(
            title: w.title, observations: w.observations,
            firstRequires: w.requires.first?.title
        )
        ready = true
    }

    // MARK: The frame

    private var chat: some View {
        VStack(spacing: 10) {
            // The quiet line the web puts at the right of the Tutor
            // header (its tutorAside): the style the tutor was told to
            // use, named where it is chosen.
            HStack {
                Spacer(minLength: 0)
                Text(tutorStyleLabel(store.preferences))
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
            .padding(.horizontal, 14)
            .padding(.top, 8)

            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        if turns.isEmpty { welcome }

                        ForEach(Array(turns.enumerated()), id: \.offset) { i, turn in
                            turnView(turn, at: i)
                                .id(i)
                        }

                        if busy {
                            Text("The tutor is thinking…")
                                .font(.callout)
                                .foregroundStyle(G.text3)
                                .padding(.horizontal, 6)
                                .id("busy")
                        }

                        if !busy && (error != nil || turns.last?.role == "user") {
                            errorRow
                        }

                        if !turns.isEmpty && !busy {
                            HStack {
                                Spacer()
                                Button("Start a new thread") {
                                    turns = []
                                    error = nil
                                }
                                .buttonStyle(.plain)
                                .font(.caption)
                                .foregroundStyle(G.text3)
                                Spacer()
                            }
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                }
                .onChange(of: turns.count) { _, _ in scrollToEnd(proxy) }
                .onChange(of: busy) { _, _ in scrollToEnd(proxy) }
            }

            // The suggestion chips — the web's three questions. The
            // check one leaves the chat for the structured session.
            FlowLayout(spacing: 8) {
                ForEach(suggestions) { s in
                    Button { tap(s) } label: {
                        Text(s.text)
                            .font(.callout.weight(.medium))
                            .foregroundStyle(G.text)
                            .padding(.horizontal, 14)
                            .frame(height: 34)
                            .background(G.surface, in: Capsule())
                            .overlay(Capsule().stroke(G.border, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .disabled(busy)
                }
            }
            .padding(.horizontal, 14)

            composer
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
        }
    }

    /// The empty thread's welcome turn — the web's verbatim, with its
    /// [1] chip naming the note.
    private var welcome: some View {
        VStack(alignment: .leading, spacing: 8) {
            ChatMarkdownView(
                text: "Ask me anything about \(title). I answer from your note and cite it as [1], and I will check you as we go.",
                role: .assistant
            )
            if let note = sources.first {
                citeChip(note)
            }
        }
        .id("welcome")
    }

    /// One turn: the bubble as AskView draws it — the learner's right
    /// and tinted, the tutor's left on the surface — with the reply's
    /// citation chips under it, and Why? on the newest tutor turn.
    private func turnView(_ turn: SidecarClient.ChatMessage, at i: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                if turn.role == "user" { Spacer(minLength: 60) }
                ChatMarkdownView(
                    text: turn.content,
                    role: turn.role == "user" ? .user : .assistant
                )
                if turn.role != "user" { Spacer(minLength: 60) }
            }
            if turn.role == "assistant" {
                HStack(spacing: 6) {
                    ForEach(tutorCitedNumbers(turn.content, known: Set(sources.map(\.n))), id: \.self) { n in
                        if let s = byNumber[n] { citeChip(s) }
                    }
                    if i == lastTutor && !busy {
                        Spacer(minLength: 4)
                        Button("Why?") { ask("Why?") }
                            .buttonStyle(.plain)
                            .font(.callout)
                            .foregroundStyle(G.accentText)
                    }
                }
                .padding(.horizontal, 6)
            }
        }
    }

    /// The kit Cite chip: the numbered disc and the source's name in a
    /// 26pt bordered pill — a button only when the source is a web URL,
    /// a plain label otherwise.
    private func citeChip(_ s: TutorCitationSource) -> some View {
        let chip = HStack(spacing: 6) {
            Text("\(s.n)")
                .font(.caption.weight(.bold))
                .foregroundStyle(G.text2)
                .frame(width: 20, height: 20)
                .background(G.surface2, in: Circle())
            Text(s.label)
                .font(.caption)
                .foregroundStyle(G.text2)
                .lineLimit(1)
        }
        .padding(.leading, 3)
        .padding(.trailing, 10)
        .frame(height: 26)
        .background(G.surface, in: Capsule())
        .overlay(Capsule().stroke(G.border, lineWidth: 1))
        return Group {
            if let href = s.href, let url = URL(string: href),
               url.scheme == "https" || url.scheme == "http" {
                Button { NSWorkspace.shared.open(url) } label: { chip }
                    .buttonStyle(.plain)
            } else {
                chip
            }
        }
    }

    /// The error row — AskView's card with the web's two states: a
    /// refusal's words, or "your last question has no answer yet" after
    /// a dropped request, with Try again to re-send the same thread.
    private var errorRow: some View {
        HStack(spacing: 10) {
            Text(error ?? "Your last question has no answer yet.")
                .font(.callout)
                .foregroundStyle(G.text)
            Spacer(minLength: 8)
            if turns.last?.role == "user" {
                Button("Try again") { send() }
                    .buttonStyle(.plain)
                    .font(.callout.weight(.medium))
                    .foregroundStyle(G.accentText)
            }
        }
        .padding(12)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
    }

    /// The composer — the merged @ field AskView carries: `@` completes
    /// the catalog's concepts and standalone assets into the draft.
    private var composer: some View {
        HStack(spacing: 10) {
            MentionField(
                text: $draft,
                focused: $composerFocused,
                prompt: "Ask about this concept, or type @ to make something",
                lineLimit: 1 ... 6,
                horizontalPadding: 12,
                verticalPadding: 9,
                options: { store.mentionOptions },
                onSubmit: { ask(draft) }
            )
            Button {
                ask(draft)
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
            }
            .buttonStyle(.plain)
            .foregroundStyle(G.btnFace)
            .disabled(busy || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .keyboardShortcut(.return, modifiers: .command)
        }
    }

    // MARK: The send

    private func tap(_ s: TutorSuggestion) {
        if s.check {
            // The native split: "Give me a check" opens the graded
            // session the panel swaps in — the web sends the words to
            // the tutor and lets its CHECK: machinery grade the answer.
            onSession(.check)
        } else {
            ask(s.text)
        }
    }

    /// A learner turn joins the thread and the thread goes to the
    /// tutor — the web's `ask`.
    private func ask(_ text: String) {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !busy else { return }
        turns.append(SidecarClient.ChatMessage(role: "user", content: content))
        draft = ""
        error = nil
        send()
    }

    /// One turn through the sidecar's `/api/agent/chat`: the thread's
    /// tail as the request, the reply's `message.content` appended as
    /// the assistant turn, and a fresh `sources` list replacing the
    /// chips when it names them — the web's `ask`/`retry` halves. The
    /// refusal mapping is the web's `errorFor`.
    private func send() {
        guard !busy, turns.last?.role == "user" else { return }
        busy = true
        error = nil
        let messages = tutorRequestTurns(turns)
        let slug = self.slug
        Task { @MainActor in
            do {
                let client = try await sidecar.readyClient()
                let reply = try await client.chat(.init(conceptSlug: slug, messages: messages))
                if let message = reply["message"] as? [String: Any],
                   let content = (message["content"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                   !content.isEmpty {
                    if let list = reply["sources"] as? [[String: Any]], !list.isEmpty {
                        sources = list.compactMap(Self.parseSource)
                    }
                    turns.append(SidecarClient.ChatMessage(role: "assistant", content: content))
                } else {
                    error = "The tutor sent an empty reply. Try asking again."
                }
            } catch let err as SidecarClient.SidecarError {
                if err.code == "MISSING_API_KEY" {
                    error = err.error ?? "The tutor has no model provider key yet. Add one in Settings, under Providers."
                } else if err.code == "CONCEPT_UNAVAILABLE" {
                    error = "The knowledge base is unreachable, so the tutor has no note to read."
                } else if err.status == 429 {
                    error = "That was a lot of questions in a minute. Wait a moment and try again."
                } else {
                    error = err.error ?? "The tutor did not answer (HTTP \(err.status))."
                }
            } catch {
                self.error = "The tutor did not answer: the sidecar could not be reached."
            }
            busy = false
        }
    }

    /// `{n, label, href}` from the reply's `sources` — the same list the
    /// prompt's own builder makes, so a reply's list is trusted whole.
    private static func parseSource(_ raw: [String: Any]) -> TutorCitationSource? {
        guard
            let n = (raw["n"] as? NSNumber)?.intValue,
            let label = raw["label"] as? String
        else { return nil }
        return TutorCitationSource(n: n, label: label, href: raw["href"] as? String)
    }

    /// The thread box scrolls to its newest turn, as the web's does.
    private func scrollToEnd(_ proxy: ScrollViewProxy) {
        let anchor: AnyHashable = busy ? "busy" : max(turns.count - 1, 0)
        withAnimation { proxy.scrollTo(anchor, anchor: .bottom) }
    }
}
