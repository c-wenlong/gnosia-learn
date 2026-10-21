import SwiftUI

/// The open tutor, the web `/ask` page's shape: a subject nothing in the
/// catalog covers gets a conversation that is not saved and moves no mastery
/// (H4 of docs/proposals/home-page.md — the page says so above the chat, and
/// this one does too).
///
/// Flow: type a subject → Start → the opening "I want to learn about X" goes
/// to the sidecar and the tutor answers with its own question. Every later
/// turn sends the whole thread, like `OpenTutorChat`'s `trimForRequest`
/// (last-30 turns; the thread is small, so the cap is the only trimming).
struct AskView: View {
    @Environment(SidecarManager.self) private var sidecar

    @State private var subject = ""
    @State private var turns: [SidecarClient.ChatMessage] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var started = false
    @State private var error: String?

    var body: some View {
        Group {
            if !started {
                subjectEntry
            } else {
                chat
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(G.page)
        .navigationTitle("Ask")
    }

    /// The gate: a subject, then Start, like the web page's `waiting` branch.
    /// The note about nothing being saved is verbatim the page's promise.
    private var subjectEntry: some View {
        VStack(alignment: .leading, spacing: 20) {
            Text("Ask the tutor")
                .font(.system(.title, design: .serif, weight: .bold))
                .foregroundStyle(G.text)
            Text("Nothing in your notebook needs to cover this. The chat is not saved, and answers here move no mastery.")
                .font(.callout)
                .foregroundStyle(G.text2)
            HStack(spacing: 10) {
                TextField("What do you want to learn about?", text: $subject)
                    .textFieldStyle(.plain)
                    .font(.body)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
                    .onSubmit(start)
                Button("Start", action: start)
                    .buttonStyle(.borderedProminent)
                    .tint(G.btnFace)
                    .disabled(subject.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            if case .failed(let why) = sidecar.status {
                Text(why)
                    .font(.callout)
                    .foregroundStyle(.red)
            }
        }
        .frame(maxWidth: 560, alignment: .leading)
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var chat: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(subject)
                            .font(.system(.title2, design: .serif, weight: .bold))
                            .foregroundStyle(G.text)
                        ForEach(turns.indices, id: \.self) { i in
                            bubble(turns[i])
                                .id(i)
                        }
                        if busy {
                            Text("The tutor is thinking…")
                                .font(.callout)
                                .foregroundStyle(G.text2)
                                .id("busy")
                        }
                        if let error {
                            HStack {
                                Text(error).font(.callout)
                                Spacer()
                                Button("Try again") { send(turns) }
                                    .buttonStyle(.bordered)
                            }
                            .padding(12)
                            .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
                        }
                    }
                    .frame(maxWidth: 720, alignment: .leading)
                    .padding(28)
                    .frame(maxWidth: .infinity)
                }
                .onChange(of: turns.count) { _, _ in
                    withAnimation { proxy.scrollTo(turns.count - 1, anchor: .bottom) }
                }
            }
            composer
        }
    }

    /// User turns sit right in an ink bubble, tutor turns left on a surface
    /// card — the web's `UserMessage`/`TutorMessage` split. The bubble and
    /// its contents are one webview (ChatMarkdownView): the tutor's turn
    /// renders markdown + KaTeX, the learner's literal text + KaTeX maths,
    /// matching the web's NoteProse/MathText split.
    private func bubble(_ turn: SidecarClient.ChatMessage) -> some View {
        HStack {
            if turn.role == "user" { Spacer(minLength: 80) }
            ChatMarkdownView(
                text: turn.content,
                role: turn.role == "user" ? .user : .assistant
            )
            if turn.role != "user" { Spacer(minLength: 80) }
        }
    }

    private var composer: some View {
        HStack(spacing: 10) {
            TextField("Answer, or ask a question", text: $draft, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1 ... 6)
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
                .onSubmit { ask(draft) }
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
        .padding(.horizontal, 28)
        .padding(.vertical, 14)
        .background(G.page)
    }

    private func start() {
        let named = subject.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !named.isEmpty else { return }
        subject = named
        started = true
        let opening = [SidecarClient.ChatMessage(role: "user", content: "I want to learn about \(named).")]
        turns = opening
        send(opening)
    }

    private func ask(_ text: String) {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !busy else { return }
        let thread = turns + [SidecarClient.ChatMessage(role: "user", content: content)]
        turns = thread
        draft = ""
        send(thread)
    }

    /// One turn through the sidecar: the subject plus the thread's last 30
    /// entries, the same window `trimForRequest` keeps. The reply's
    /// `message.content` joins as the assistant turn; the refusal mapping is
    /// the web's `errorFor` (MISSING_API_KEY names Settings, 429 slows down).
    private func send(_ thread: [SidecarClient.ChatMessage]) {
        busy = true
        error = nil
        Task {
            do {
                let client = try await sidecar.readyClient()
                let reply = try await client.chat(.init(
                    subject: subject,
                    messages: Array(thread.suffix(30))
                ))
                if let message = reply["message"] as? [String: Any],
                   let content = message["content"] as? String {
                    turns = turns + [SidecarClient.ChatMessage(role: "assistant", content: content)]
                } else {
                    error = "The tutor answered without a message."
                }
            } catch let err as SidecarClient.SidecarError {
                if err.code == "MISSING_API_KEY" {
                    self.error = err.error ?? "The tutor has no model provider key yet. Add one in Settings."
                } else if err.status == 429 {
                    self.error = "That was a lot of questions in a minute. Wait a moment and try again."
                } else {
                    self.error = err.error ?? "The tutor did not answer (HTTP \(err.status))."
                }
            } catch {
                self.error = "The tutor did not answer: the sidecar could not be reached."
            }
            busy = false
        }
    }
}
