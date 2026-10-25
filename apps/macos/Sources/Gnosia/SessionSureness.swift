//
//  SessionSureness.swift
//  Gnosia
//
//  "How sure are you?" and the reasoning box — the web's Sureness in
//  apps/web/src/components/session/SessionFocus.tsx, asked under the
//  options once one is picked, on the Teach session (TutorPanel) and the
//  module check (ModuleCheckView) alike. Both go on the observation
//  (docs/proposals/structured-checks.md, K5); "I don't know" sends no
//  confidence (K6), so this view is never what that button reads.
//

import SwiftUI

struct SessionSureness: View {
    @Binding var confidence: Int
    @Binding var thinking: String
    /// Saving, or sent and waiting to be retried: the answer cannot change.
    let locked: Bool
    /// The reasoning box's focus, so the question card can stand its 1 to 4
    /// option keys down while the learner types digits into it.
    var reasoningFocused: FocusState<Bool>.Binding

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                Text("How sure are you?")
                    .font(.caption)
                    .foregroundStyle(G.text2)
                Picker("How sure are you?", selection: $confidence) {
                    ForEach(sessionConfidenceStops, id: \.self) { stop in
                        Text("\(stop)%").tag(stop)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Your reasoning (optional)")
                    .font(.caption)
                    .foregroundStyle(G.text2)
                TextField("Why you picked it, or what you were unsure about", text: $thinking, axis: .vertical)
                    .textFieldStyle(.plain)
                    .lineLimit(2 ... 6)
                    .focused(reasoningFocused)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 9)
                    .background(G.surface, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(G.border))
                    // The web's maxLength: the box holds no more than an answer sends.
                    .onChange(of: thinking) { _, next in
                        if next.count > sessionTextLimit { thinking = String(next.prefix(sessionTextLimit)) }
                    }
            }
        }
        .disabled(locked)
        .padding(.top, 4)
    }
}
