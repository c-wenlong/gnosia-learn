//
//  SettingsView.swift
//  Gnosia
//
//  The Settings pane (⌘,): where the snapshot file is, when nothing in the
//  environment says otherwise. GNOSIA_CATALOG still wins over this field —
//  the resolution order is documented on CatalogLocation.
//

import SwiftUI

struct SettingsView: View {
    @Environment(CatalogStore.self) private var store
    @AppStorage("catalogPath") private var catalogPath = ""

    var body: some View {
        Form {
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
        .formStyle(.grouped)
        .frame(width: 480)
    }
}
