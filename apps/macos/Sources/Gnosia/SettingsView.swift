//
//  SettingsView.swift
//  Gnosia
//
//  The Settings pane (⌘,): where the snapshot file is, when nothing in the
//  environment says otherwise; the mirror queue's pending and dropped
//  counts, when it has any to report; and the tutor's provider keys and
//  model chain, managed through the sidecar in TutorSettingsView.
//  GNOSIA_CATALOG still wins over this field —
//  the resolution order is documented on CatalogLocation.
//

import SwiftUI

struct SettingsView: View {
    @Environment(CatalogStore.self) private var store
    @Environment(LearnerStore.self) private var learner
    @Environment(SidecarManager.self) private var sidecar
    @AppStorage("catalogPath") private var catalogPath = ""
    @State private var tutor = TutorSettings()

    var body: some View {
        Form {
            Section("Catalog") {
                TextField("Catalog SQLite file:", text: $catalogPath)
                    .textFieldStyle(.roundedBorder)
                Text("Leave empty for the default: <data home>/app-catalog.db — " +
                     "$GNOSIA_HOME, then ~/.gnosia. GNOSIA_CATALOG overrides it.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if let takenAt = store.meta["taken_at"].flatMap(Double.init) {
                    LabeledContent("Snapshot taken") {
                        Text(Date(timeIntervalSince1970: takenAt), style: .date)
                        + Text(" ")
                        + Text(Date(timeIntervalSince1970: takenAt), style: .time)
                    }
                }
                LabeledContent("Reading from") {
                    Text(store.location.catalogPath)
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                }
                Button("Reload catalog now") { store.reload() }
            }

            // The mirror queue, only when it has something to say: writes
            // learner.db still owes the catalog, plus what gave up retrying.
            if learner.pendingMirrors > 0 || learner.droppedMirrors > 0 {
                Section("Learner mirror") {
                    if learner.pendingMirrors > 0 {
                        LabeledContent("Writes owed to the catalog") {
                            Text("\(learner.pendingMirrors)")
                        }
                    }
                    if learner.droppedMirrors > 0 {
                        LabeledContent("Dropped after retrying") {
                            Text("\(learner.droppedMirrors)")
                        }
                    }
                    if let lastMirrorError = learner.lastMirrorError {
                        Text(lastMirrorError)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            TutorSettingsSection(settings: tutor)
        }
        .formStyle(.grouped)
        .frame(width: 560)
        .task { await tutor.refresh(using: sidecar) }
    }
}
