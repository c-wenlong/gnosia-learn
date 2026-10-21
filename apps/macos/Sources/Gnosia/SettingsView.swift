//
//  SettingsView.swift
//  Gnosia
//
//  The Settings pane (⌘,): where the snapshot file is, when nothing in the
//  environment says otherwise — and the tutor's provider keys and model
//  chain, managed through the sidecar in TutorSettingsView.
//  GNOSIA_CATALOG still wins over this field —
//  the resolution order is documented on CatalogLocation.
//

import SwiftUI

struct SettingsView: View {
    @Environment(CatalogStore.self) private var store
    @Environment(SidecarManager.self) private var sidecar
    @AppStorage("catalogPath") private var catalogPath = ""
    @State private var tutor = TutorSettings()

    var body: some View {
        Form {
            Section("Catalog") {
                TextField("Catalog SQLite file:", text: $catalogPath)
                    .textFieldStyle(.roundedBorder)
                Text("Leave empty for the default: <data home>/catalog.db — " +
                     "$GNOSIA_HOME, then $SELF_LEARN_HOME, then ~/.gnosia. GNOSIA_CATALOG overrides it.")
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

            TutorSettingsSection(settings: tutor)
        }
        .formStyle(.grouped)
        .frame(width: 560)
        .task { await tutor.refresh(using: sidecar) }
    }
}
