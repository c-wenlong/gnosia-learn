//
//  TutorSettingsView.swift
//  Gnosia
//
//  The Settings pane's Tutor sections: provider keys and the model chain,
//  driven through the sidecar's `/api/learner/*` routes — the same contract
//  the web app's Settings page writes against (docs/BYOK.md,
//  docs/TUTOR-MODELS.md). Every write re-reads the status endpoints after,
//  so what the pane shows is what the store holds.
//

import SwiftUI

/// The pane's model: the provider rows and the chain, the form drafts, and
/// the calls. One note carries every action's result — the pane is small
/// enough that a single line does the job a toast would.
@MainActor
@Observable
final class TutorSettings {
    var rows: [SidecarClient.ProviderRow] = []
    var chain: [SidecarClient.ChainEntry] = []
    var keysReachable = true
    /// False when the sidecar has no AUTH_SECRET to open saved keys with
    /// (its health's `secret`): every saved key reads as needing re-entry.
    var keysSealable = true
    var chainReachable = true
    var loaded = false
    /// The sidecar could not be reached or refused the reads.
    var failure: String?
    /// The last action's one-line result, good or bad.
    var note: String?

    // Form state.
    var keyProvider = "nvidia"
    var keyDraft = ""
    var addProvider = "nvidia"
    var modelDraft = ""
    /// The custom-provider sheet's drafts — name, base URL and key. One set
    /// serves Add and Edit alike; `beginAdd`/`beginEdit` reset it.
    var customName = ""
    var customUrl = ""
    var customKey = ""
    /// Provider id → the ids its `/models` listed, for the Add form's Menu.
    var listedModels: [String: [String]] = [:]
    /// Calls in flight, keyed by what they act on so their buttons can spin.
    var busy: Set<String> = []

    /// Providers that hold a key, saved or the server's — the only ones a
    /// chain entry may name (the route's own rule, NO_KEY).
    var keyedProviders: [SidecarClient.ProviderRow] {
        rows.filter { $0.inUse != nil }
    }

    func label(for provider: String) -> String {
        rows.first { $0.id == provider }?.label ?? provider
    }

    /// A provider's block of the chain, for the grouped list.
    struct ProviderGroup: Identifiable {
        var id: String { provider }
        let provider: String
        let entries: [SidecarClient.ChainEntry]
    }

    /// The chain as Settings shows it (docs/TUTOR-MODELS.md): each provider's
    /// models together, providers in the order each first appears.
    var groups: [ProviderGroup] {
        var order: [String] = []
        var blocks: [String: [SidecarClient.ChainEntry]] = [:]
        for entry in chain {
            if blocks[entry.provider] == nil {
                order.append(entry.provider)
                blocks[entry.provider] = []
            }
            blocks[entry.provider]?.append(entry)
        }
        return order.map { ProviderGroup(provider: $0, entries: blocks[$0] ?? []) }
    }

    /// Re-read both status endpoints. Never throws: a sidecar that will not
    /// answer is `failure`, an unreadable catalog is `reachable: false`.
    func refresh(using sidecar: SidecarManager) async {
        do {
            let client = try await sidecar.readyClient()
            async let keys = client.providerKeys()
            async let chainReply = client.tutorChain()
            async let state = client.health()
            let (keyRows, modelChain, health) = try await (keys, chainReply, state)
            rows = keyRows.rows
            keysReachable = keyRows.reachable
            // An older sidecar sends no `secret`; take it as present.
            keysSealable = health.secret ?? true
            chain = modelChain.chain
            chainReachable = modelChain.reachable ?? true
            failure = nil
            loaded = true
        } catch {
            failure = describe(error)
        }
    }

    // MARK: - provider keys

    /// `provider` is the form's resolved pick — a removed custom provider
    /// leaves `keyProvider` naming a row that is gone.
    func saveKey(_ provider: String, using sidecar: SidecarManager) async {
        let key = keyDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !key.isEmpty else {
            note = "Paste a key first."
            return
        }
        await run(sidecar, tag: "key-\(provider)") { client in
            _ = try await client.saveProviderKey(provider, key: key)
            keyDraft = ""
            note = "\(label(for: provider)) key saved."
        }
        await refresh(using: sidecar)
    }

    func removeKey(_ provider: String, using sidecar: SidecarManager) async {
        await run(sidecar, tag: "key-\(provider)") { client in
            _ = try await client.removeProviderKey(provider)
            note = "\(label(for: provider)) key removed."
        }
        await refresh(using: sidecar)
    }

    func testKey(_ provider: String, using sidecar: SidecarManager) async {
        await run(sidecar, tag: "key-\(provider)") { client in
            note = testNote(try await client.testProviderKey(provider), for: provider)
        }
    }

    // MARK: - custom providers

    /// The shortest key the routes take (`PROVIDER_KEY_LIMITS.minChars`): a
    /// shorter one is refused before it travels, as the web form's floor is.
    static let customKeyFloor = 16

    /// Open the Add sheet: the drafts and the note start clean.
    func beginAddCustom() {
        customName = ""
        customUrl = ""
        customKey = ""
        note = nil
    }

    /// Open the Edit sheet on a custom row: its name and base URL as the
    /// draft, the key field blank — blank keeps the saved key, as the web
    /// card's "Leave it empty to keep the key saved now" says.
    func beginEditCustom(_ row: SidecarClient.ProviderRow) {
        customName = row.label
        customUrl = row.custom?.baseUrl ?? ""
        customKey = ""
        note = nil
    }

    /// The web card's "Add custom provider" (T14): name, base URL and key in
    /// one write, so a provider never exists without its key. True when the
    /// sheet may close.
    func addCustom(using sidecar: SidecarManager) async -> Bool {
        let label = customName.trimmingCharacters(in: .whitespacesAndNewlines)
        let url = customUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = customKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let ok = await run(sidecar, tag: "custom-add") { client in
            let reply = try await client.addCustomProvider(label: label, baseUrl: url, key: key)
            let added = (reply["provider"] as? [String: Any])?["label"] as? String ?? label
            customName = ""
            customUrl = ""
            customKey = ""
            note = "Added \(added). Pick a model for it below."
        }
        await refresh(using: sidecar)
        return ok
    }

    /// The web card's Edit on an owner's provider: name, base URL and a new
    /// key when one was typed, in one write — a refused key leaves the name
    /// and the URL as they were. True when the sheet may close.
    func saveCustom(_ row: SidecarClient.ProviderRow, using sidecar: SidecarManager) async -> Bool {
        let label = customName.trimmingCharacters(in: .whitespacesAndNewlines)
        let url = customUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let key = customKey.trimmingCharacters(in: .whitespacesAndNewlines)
        let ok = await run(sidecar, tag: "key-\(row.id)") { client in
            _ = try await client.changeCustomProvider(row.id, label: label, baseUrl: url, key: key.isEmpty ? nil : key)
            customKey = ""
            note = "Saved."
        }
        await refresh(using: sidecar)
        return ok
    }

    // MARK: - the chain

    /// `provider` is the form's resolved pick, which can differ from the
    /// stale `addProvider` draft after a key went away.
    func addModel(_ provider: String, using sidecar: SidecarManager) async {
        let model = modelDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !model.isEmpty else {
            note = "Type a model id first."
            return
        }
        await run(sidecar, tag: "chain") { client in
            let reply = try await client.addTutorModel(provider, model: model)
            chain = reply.chain
            modelDraft = ""
            note = "\(model) added."
        }
    }

    func removeModel(_ entry: SidecarClient.ChainEntry, using sidecar: SidecarManager) async {
        await run(sidecar, tag: "model-\(entry.provider)-\(entry.model)") { client in
            chain = try await client.removeTutorModel(entry.provider, model: entry.model).chain
            note = "\(entry.model) removed."
        }
    }

    /// One place among the provider's models ("up"/"down"), as the web card's
    /// arrows do.
    func moveModel(_ entry: SidecarClient.ChainEntry, _ direction: String, using sidecar: SidecarManager) async {
        await run(sidecar, tag: "chain") { client in
            chain = try await client.moveTutorModel(entry.provider, model: entry.model, direction: direction).chain
        }
    }

    /// The provider's models together past the next provider's, as the web
    /// card's provider arrows do.
    func moveProvider(_ provider: String, _ direction: String, using sidecar: SidecarManager) async {
        await run(sidecar, tag: "chain") { client in
            chain = try await client.moveTutorProvider(provider, direction: direction).chain
        }
    }

    /// The web card's Delete: the provider's models leave the chain and its
    /// saved key goes with them, in one transaction — so the key rows
    /// re-read too.
    func removeProvider(_ provider: String, using sidecar: SidecarManager) async {
        await run(sidecar, tag: "provider-\(provider)") { client in
            _ = try await client.removeTutorProvider(provider)
            note = "\(label(for: provider)) removed — its saved key went with it."
        }
        await refresh(using: sidecar)
    }

    func testModel(_ entry: SidecarClient.ChainEntry, using sidecar: SidecarManager) async {
        await run(sidecar, tag: "model-\(entry.provider)-\(entry.model)") { client in
            note = testNote(try await client.testTutorModel(entry.provider, model: entry.model), for: entry.provider)
        }
    }

    /// The provider's own `/models` for the Add form's pick list.
    func loadModels(_ provider: String, using sidecar: SidecarManager) async {
        await run(sidecar, tag: "list-\(provider)") { client in
            let reply = try await client.tutorModelList(provider)
            if let models = reply["models"] as? [[String: Any]] {
                listedModels[provider] = models.compactMap { $0["id"] as? String }
                note = "\(listedModels[provider]?.count ?? 0) models listed — pick from the menu."
            } else {
                note = "\(label(for: provider)): \(reply["message"] as? String ?? "no model list.")"
            }
        }
    }

    // MARK: - plumbing

    /// One call against the sidecar: a thrown refusal becomes the note,
    /// a success the caller's own — and the answer the sheets close on.
    /// `tag` spins the buttons that own the call.
    @discardableResult
    private func run(_ sidecar: SidecarManager, tag: String, _ work: (SidecarClient) async throws -> Void) async -> Bool {
        busy.insert(tag)
        defer { busy.remove(tag) }
        do {
            try await work(sidecar.readyClient())
            return true
        } catch {
            note = describe(error)
            return false
        }
    }

    private func describe(_ error: Error) -> String {
        if let refusal = error as? SidecarClient.SidecarError {
            return refusal.error ?? "The sidecar answered \(refusal.status)."
        }
        return "The sidecar could not be reached."
    }

    /// What a Test button says: the key works, or the provider's words.
    private func testNote(_ reply: [String: Any], for provider: String) -> String {
        if reply["ok"] as? Bool == true {
            let model = (reply["served"] as? String) ?? (reply["model"] as? String) ?? (reply["tested"] as? String) ?? ""
            return "\(label(for: provider)): the key works\(model.isEmpty ? "." : " — \(model).")"
        }
        return "\(label(for: provider)): \(reply["message"] as? String ?? "the test failed.")"
    }
}

/// The Form sections SettingsView hosts: provider keys first, then the chain.
/// The store is the pane's `@State`; the pane owns the first refresh.
struct TutorSettingsSection: View {
    @Environment(SidecarManager.self) private var sidecar
    @Bindable var settings: TutorSettings
    /// The custom-provider sheet: one for a new provider, one carrying the
    /// row an Edit acts on.
    @State private var customSheet: CustomSheet?

    /// Which sheet is up, and whose drafts it edits.
    private enum CustomSheet: Identifiable {
        case add
        case edit(SidecarClient.ProviderRow)
        var id: String {
            switch self {
            case .add: "add"
            case .edit(let row): row.id
            }
        }
    }

    var body: some View {
        Section("Tutor providers") {
            if let failure = settings.failure {
                Label(failure, systemImage: "exclamationmark.triangle")
                    .foregroundStyle(G.danger)
                Button("Try again") { Task { await settings.refresh(using: sidecar) } }
            } else {
                if !settings.keysReachable {
                    Text("The catalog could not be read — the server's keys alone show.")
                        .font(.caption)
                        .foregroundStyle(G.warnText)
                }
                if !settings.keysSealable {
                    Text("The tutor service has no AUTH_SECRET, so saved keys cannot be read or saved here. Put the web app's AUTH_SECRET in ~/.gnosia/.env or apps/web/.env.local, then reopen the app.")
                        .font(.caption)
                        .foregroundStyle(G.warnText)
                }
                ForEach(settings.rows) { row in
                    ProviderKeyLine(row: row, settings: settings) {
                        settings.beginEditCustom(row)
                        customSheet = .edit(row)
                    }
                }
                if settings.loaded {
                    Button("Add custom provider…") {
                        settings.beginAddCustom()
                        customSheet = .add
                    }
                    .disabled(!settings.keysReachable || settings.busy.contains("custom-add"))
                    keyEditor
                } else {
                    ProgressView().controlSize(.small)
                }
            }
        }
        .sheet(item: $customSheet) { sheet in
            switch sheet {
            case .add:
                CustomProviderSheet(title: "Add a custom provider", row: nil, settings: settings) {
                    customSheet = nil
                }
            case .edit(let row):
                CustomProviderSheet(title: "Edit \(row.label)", row: row, settings: settings) {
                    customSheet = nil
                }
            }
        }

        Section("Model chain — the tutor tries these, top to bottom") {
            if !settings.chainReachable {
                Text("The chain could not be read.")
                    .font(.caption)
                    .foregroundStyle(G.warnText)
            }
            if settings.chain.isEmpty {
                Text("No models yet — the tutor answers nothing until one is added.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            ForEach(settings.groups) { group in
                providerBlock(group)
            }
            if settings.loaded && settings.failure == nil {
                modelEditor
            }
        }

        if let note = settings.note {
            Section {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    // MARK: - provider keys

    /// One provider: its name and the model a Test calls, its key state, and
    /// its actions — Test plus Remove for a built-in's saved key, Edit and
    /// Delete for a provider the owner added (the web card's row, T14: the
    /// key Test is the chain's model Test there, and Delete takes the
    /// provider whole, its key and its models with it).
    private struct ProviderKeyLine: View {
        @Environment(SidecarManager.self) private var sidecar
        let row: SidecarClient.ProviderRow
        let settings: TutorSettings
        /// Opens the edit sheet on a custom row; unused on a built-in.
        var onEdit: () -> Void = {}

        var body: some View {
            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.label)
                    Text(row.model.isEmpty ? (row.custom?.baseUrl ?? "") : row.model)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer()
                status
                if settings.busy.contains("key-\(row.id)") || settings.busy.contains("provider-\(row.id)") {
                    ProgressView().controlSize(.small)
                } else if row.custom != nil {
                    Button("Edit") { onEdit() }
                    Button("Delete") { Task { await settings.removeProvider(row.id, using: sidecar) } }
                } else {
                    Button("Test") { Task { await settings.testKey(row.id, using: sidecar) } }
                        .disabled(row.inUse == nil)
                    if row.saved != nil {
                        Button {
                            Task { await settings.removeKey(row.id, using: sidecar) }
                        } label: {
                            Image(systemName: "trash")
                        }
                        .buttonStyle(.borderless)
                        .help("Remove the saved key")
                    }
                }
            }
        }

        /// Whose key the tutor calls this provider with, in three words.
        @ViewBuilder private var status: some View {
            if let saved = row.saved, saved.readable {
                Text("saved ·…\(saved.last4)")
                    .font(.caption)
                    .foregroundStyle(G.okText)
            } else if row.saved != nil {
                Text("saved, needs re-entry")
                    .font(.caption)
                    .foregroundStyle(G.warnText)
            } else if row.server {
                Text("server key")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("no key")
                    .font(.caption)
                    .foregroundStyle(G.text3)
            }
        }
    }

    /// The save-key form: any provider, a SecureField, Save — and a link out
    /// to where the provider hands keys out, when it names one.
    private var keyEditor: some View {
        let picked = settings.rows.contains { $0.id == settings.keyProvider } ? settings.keyProvider : (settings.rows.first?.id ?? "nvidia")
        return VStack(alignment: .leading, spacing: 6) {
            Picker("Add or replace a key", selection: $settings.keyProvider) {
                ForEach(settings.rows) { row in
                    Text(row.label).tag(row.id)
                }
            }
            HStack(spacing: 8) {
                SecureField("API key", text: $settings.keyDraft)
                    .textFieldStyle(.roundedBorder)
                Button("Save key") { Task { await settings.saveKey(picked, using: sidecar) } }
                    .disabled(settings.keyDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                if let url = settings.rows.first(where: { $0.id == picked })?.keyUrl.flatMap({ URL(string: $0) }) {
                    Link("Get a key", destination: url)
                }
            }
        }
    }

    // MARK: - the chain

    /// A provider's block: its name with the provider-level arrows on the
    /// right, then its models each with entry arrows, Test and Remove.
    @ViewBuilder
    private func providerBlock(_ group: TutorSettings.ProviderGroup) -> some View {
        let at = settings.groups.firstIndex { $0.provider == group.provider } ?? 0
        HStack(spacing: 8) {
            Text(settings.label(for: group.provider))
                .font(.callout.weight(.semibold))
            Spacer()
            if settings.busy.contains("provider-\(group.provider)") {
                ProgressView().controlSize(.small)
            } else {
                arrows(up: at > 0, down: at < settings.groups.count - 1) { direction in
                    Task { await settings.moveProvider(group.provider, direction, using: sidecar) }
                }
                Button {
                    Task { await settings.removeProvider(group.provider, using: sidecar) }
                } label: {
                    Image(systemName: "trash")
                }
                .buttonStyle(.borderless)
                .help("Remove this provider, its models and its saved key")
            }
        }
        .padding(.top, 6)

        ForEach(group.entries.indices, id: \.self) { index in
            let entry = group.entries[index]
            HStack(spacing: 8) {
                Text(entry.model)
                    .font(.callout.monospaced())
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer()
                if settings.busy.contains("model-\(entry.provider)-\(entry.model)") {
                    ProgressView().controlSize(.small)
                } else {
                    arrows(up: index > 0, down: index < group.entries.count - 1) { direction in
                        Task { await settings.moveModel(entry, direction, using: sidecar) }
                    }
                    Button("Test") { Task { await settings.testModel(entry, using: sidecar) } }
                    Button {
                        Task { await settings.removeModel(entry, using: sidecar) }
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.borderless)
                    .help("Remove from the chain")
                }
            }
            .padding(.leading, 12)
        }
    }

    /// The two chevrons a move is made of; a move that changes nothing is
    /// disabled rather than sent.
    private func arrows(up: Bool, down: Bool, action: @escaping (String) -> Void) -> some View {
        HStack(spacing: 2) {
            Button { action("up") } label: {
                Image(systemName: "chevron.up")
            }
            .buttonStyle(.borderless)
            .disabled(!up)
            Button { action("down") } label: {
                Image(systemName: "chevron.down")
            }
            .buttonStyle(.borderless)
            .disabled(!down)
        }
    }

    /// The add-model form: only providers a key exists for, a model id typed
    /// or picked off the provider's own list. A key removed since the draft
    /// was picked leaves `addProvider` stale, so the form falls back to the
    /// first keyed provider rather than a tag that matches nothing.
    private var modelEditor: some View {
        let keyed = settings.keyedProviders
        let picked = keyed.contains { $0.id == settings.addProvider } ? settings.addProvider : (keyed.first?.id ?? "")
        return VStack(alignment: .leading, spacing: 6) {
            if keyed.isEmpty {
                Text("Add a provider key above first.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                Picker("Add a model", selection: $settings.addProvider) {
                    ForEach(keyed) { row in
                        Text(row.label).tag(row.id)
                    }
                }
                HStack(spacing: 8) {
                    TextField("Model id", text: $settings.modelDraft)
                        .textFieldStyle(.roundedBorder)
                    Menu("Listed") {
                        let models = settings.listedModels[picked] ?? []
                        if models.isEmpty {
                            Text("Fetch the provider's list first")
                        } else {
                            ForEach(models.prefix(300), id: \.self) { id in
                                Button(id) { settings.modelDraft = id }
                            }
                        }
                    }
                    if settings.busy.contains("list-\(picked)") {
                        ProgressView().controlSize(.small)
                    } else {
                        Button("Fetch") { Task { await settings.loadModels(picked, using: sidecar) } }
                    }
                    Button("Add") { Task { await settings.addModel(picked, using: sidecar) } }
                        .disabled(settings.modelDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || settings.busy.contains("chain"))
                }
            }
        }
    }
}

/// The custom-provider sheet (docs/TUTOR-MODELS.md, T14): the web card's Add
/// dialog and a row's Edit share the three fields — name, base URL, key —
/// since both writes carry all of them. A refusal is the pane's one `note`,
/// rendered here so it is seen while the sheet stays up; a success closes
/// it and the note reads under the providers list.
private struct CustomProviderSheet: View {
    @Environment(SidecarManager.self) private var sidecar
    let title: String
    /// The row an Edit acts on; nil when adding.
    let row: SidecarClient.ProviderRow?
    @Bindable var settings: TutorSettings
    let close: () -> Void

    private var adding: Bool { row == nil }
    private var name: String { settings.customName.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var url: String { settings.customUrl.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var key: String { settings.customKey.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// The web form's gates: Add asks for all three with a full-length key
    /// (its `minLength`), Edit for something changed — a typed key, a new
    /// name or a new URL. Anything past that is the route's own check, and
    /// its refusal shows in `note`.
    private var ready: Bool {
        if adding {
            return !name.isEmpty && !url.isEmpty && key.count >= TutorSettings.customKeyFloor
        }
        guard let row else { return false }
        return !key.isEmpty || name != row.label || url != (row.custom?.baseUrl ?? "")
    }

    private var saving: Bool {
        settings.busy.contains(adding ? "custom-add" : "key-\(row?.id ?? "")")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            Grid(alignment: .leadingFirstTextBaseline, horizontalSpacing: 10, verticalSpacing: 8) {
                GridRow {
                    Text("Name").foregroundStyle(.secondary)
                    TextField("My gateway", text: $settings.customName)
                        .textFieldStyle(.roundedBorder)
                }
                GridRow {
                    Text("Base URL").foregroundStyle(.secondary)
                    TextField("https://api.example.com/v1", text: $settings.customUrl)
                        .textFieldStyle(.roundedBorder)
                }
                GridRow {
                    Text("API key").foregroundStyle(.secondary)
                    SecureField(adding ? "API key" : "Empty keeps the saved key", text: $settings.customKey)
                        .textFieldStyle(.roundedBorder)
                }
            }
            Text(adding
                 ? "Any OpenAI-compatible endpoint. The URL is the part before /chat/completions — https:// only, or http:// for a model server on this machine. The key is sent once and stored encrypted; only its last four characters are shown again. For a local server that needs no key, type any 16 characters."
                 : "The name and the URL save together. The key field left empty keeps the key saved now; a new one is sent once and stored encrypted.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let note = settings.note {
                Text(note)
                    .font(.caption)
                    .foregroundStyle(G.danger)
            }
            HStack {
                if saving { ProgressView().controlSize(.small) }
                Spacer()
                Button("Cancel") { close() }
                    .disabled(saving)
                Button(adding ? "Add provider" : "Save") {
                    Task {
                        if adding {
                            if await settings.addCustom(using: sidecar) { close() }
                        } else if let row, await settings.saveCustom(row, using: sidecar) {
                            close()
                        }
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!ready || saving)
            }
        }
        .padding(20)
        .frame(width: 440)
    }
}
