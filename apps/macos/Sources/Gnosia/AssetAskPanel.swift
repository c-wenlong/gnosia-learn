//
//  AssetAskPanel.swift
//  Gnosia
//
//  Ask on a library asset — the web's AskPanel (library/AskPanel.tsx): a
//  quick unsaved chat about the video, note or diagram open on the page,
//  answered by the sidecar's `/api/agent/chat` asset shape, which reads the
//  asset's words on the server (a video's transcript, a note's markdown, a
//  diagram's labels). A video also sends `at`, the player's position in
//  seconds, so a question lands where the learner actually is.
//
//  Where the web opens the panel under the title row, macOS gives it the
//  window's trailing inspector column (.inspector): the player stays on
//  screen while the chat runs, which a sheet would hide and an inline fold
//  would push down the page. The thread's state lives in the detail view's
//  AssetAskModel rather than in the panel itself, so closing and reopening
//  the inspector mid-watch keeps it — the web keeps AskPanel mounted for
//  the same reason. Nothing is persisted: leaving the page loses the
//  thread, and it moves no mastery.
//

import SwiftUI

/// The chat an open Ask panel is holding: the thread, the draft and the
/// send's state. Owned by the detail view so the inspector's own mount
/// cycles do not clear it; replaced when the asset under it changes, the
/// way the web remounts the page per asset id.
@Observable
final class AssetAskModel {
    var turns: [SidecarClient.ChatMessage] = []
    var draft = ""
    var busy = false
    var error: String?
}

/// The web's askSubjectOf (lib/row-menu.ts): the asset kinds Ask answers
/// about — video, note, diagram — to the word the composer uses.
func askSubject(of kind: String) -> String? {
    switch kind {
    case "video": return "video"
    case "note": return "note"
    case "diagram_svg": return "diagram"
    default: return nil
    }
}

/// The web's AskButton (AssetActions.tsx): a small bordered toggle in the
/// header's action row — the sparkle lifts to the accent while the panel
/// is open.
struct AssetAskButton: View {
    @Binding var asking: Bool
    let subject: String

    var body: some View {
        Button { asking.toggle() } label: {
            HStack(spacing: 5) {
                Image(systemName: "sparkle")
                    .foregroundStyle(asking ? G.accentText : .secondary)
                Text("Ask")
            }
        }
        .help("Ask the tutor a quick question about this \(subject). Not saved.")
    }
}

/// The panel itself: bubbles, composer and the not-saved line, in the
/// bubble and composer shapes AskView draws for the open tutor.
struct AssetAskPanel: View {
    @Environment(SidecarManager.self) private var sidecar

    let assetId: String
    /// What the composer names: "video", "note", "diagram".
    let subject: String
    /// Where a video's player is, read as each question is sent.
    var position: () -> Double? = { nil }
    @Bindable var model: AssetAskModel

    @FocusState private var focused: Bool

    /// The quiet line the empty panel opens with — what the tutor reads
    /// for this kind, so the first question has its scope.
    private var scopeHint: String {
        switch subject {
        case "video":
            return "The tutor answers from this video's transcript, including where you are in it."
        case "diagram":
            return "The tutor answers from this diagram's labels."
        default:
            return "The tutor answers from this note's text."
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        if model.turns.isEmpty {
                            Text(scopeHint)
                                .font(.callout)
                                .foregroundStyle(G.text3)
                        }
                        ForEach(model.turns.indices, id: \.self) { i in
                            bubble(model.turns[i])
                                .id(i)
                        }
                        if model.busy {
                            Text("The tutor is thinking…")
                                .font(.callout)
                                .foregroundStyle(G.text2)
                                .id("busy")
                        }
                        if let error = model.error {
                            errorCard(error)
                        }
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onChange(of: model.turns.count) { _, _ in
                    if model.turns.count > 0 {
                        withAnimation { proxy.scrollTo(model.turns.count - 1, anchor: .bottom) }
                    }
                }
            }

            Divider().overlay(G.border)
            composer
            footnote
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(G.page)
        .task { focused = true }
    }

    /// User turns sit right in an ink bubble, tutor turns left on a
    /// surface card — AskView's split, narrowed for the column. The
    /// bubble and its contents are one webview (ChatMarkdownView) at the
    /// panel's smaller size; text selection comes free inside the page.
    private func bubble(_ turn: SidecarClient.ChatMessage) -> some View {
        HStack {
            if turn.role == "user" { Spacer(minLength: 40) }
            ChatMarkdownView(
                text: turn.content,
                role: turn.role == "user" ? .user : .assistant,
                fontSize: 12,
                cornerRadius: 12,
                horizontalPadding: 12,
                verticalPadding: 8
            )
            if turn.role != "user" { Spacer(minLength: 40) }
        }
    }

    /// The refusal block: the message and a Try again that resends the
    /// thread, in the web Callout's shape.
    private func errorCard(_ error: String) -> some View {
        HStack(alignment: .top) {
            Text(error).font(.callout)
            Spacer()
            Button("Try again") { send(model.turns) }
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(10)
        .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
    }

    private var composer: some View {
        HStack(spacing: 8) {
            TextField("Ask about this \(subject)", text: $model.draft, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1 ... 5)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
                .focused($focused)
                .onSubmit { ask(model.draft) }
            Button {
                ask(model.draft)
            } label: {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.title2)
            }
            .buttonStyle(.plain)
            .foregroundStyle(G.btnFace)
            .disabled(model.busy || model.draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            .keyboardShortcut(.return, modifiers: .command)
        }
        .padding(.horizontal, 14)
        .padding(.top, 10)
    }

    /// The web's line under the composer and its Clear, which empties the
    /// thread but keeps the panel open.
    private var footnote: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text("Not saved. Leaving this page clears it, and nothing here moves mastery.")
                .font(.caption)
                .foregroundStyle(G.text3)
            Spacer(minLength: 0)
            if !model.turns.isEmpty && !model.busy {
                Button("Clear") {
                    model.turns = []
                    model.error = nil
                }
                .buttonStyle(.plain)
                .foregroundStyle(G.accentText)
                .font(.caption)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
    }

    private func ask(_ text: String) {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !model.busy else { return }
        let thread = model.turns + [SidecarClient.ChatMessage(role: "user", content: content)]
        model.turns = thread
        model.draft = ""
        send(thread)
    }

    /// One turn through the sidecar: the asset's id, the live position
    /// when the subject is a video, and the thread's last 30 entries —
    /// the window trimForRequest keeps. The reply's `message.content`
    /// joins as the assistant turn; the refusal mapping is AskView's
    /// (MISSING_API_KEY names Settings, 429 slows down).
    @MainActor
    private func send(_ thread: [SidecarClient.ChatMessage]) {
        model.busy = true
        model.error = nil
        Task {
            do {
                let client = try await sidecar.readyClient()
                let reply = try await client.chat(.init(
                    assetId: assetId,
                    at: position(),
                    messages: Array(thread.suffix(30))
                ))
                if let message = reply["message"] as? [String: Any],
                   let content = message["content"] as? String {
                    model.turns = model.turns + [SidecarClient.ChatMessage(role: "assistant", content: content)]
                } else {
                    model.error = "The tutor answered without a message."
                }
            } catch let err as SidecarClient.SidecarError {
                if err.code == "MISSING_API_KEY" {
                    model.error = err.error ?? "The tutor has no model provider key yet. Add one in Settings."
                } else if err.status == 429 {
                    model.error = "That was a lot of questions in a minute. Wait a moment and try again."
                } else {
                    model.error = err.error ?? "The tutor did not answer (HTTP \(err.status))."
                }
            } catch {
                model.error = "The tutor did not answer: the sidecar could not be reached."
            }
            model.busy = false
        }
    }
}
