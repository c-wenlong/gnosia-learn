// swift-tools-version: 6.0
//
// Gnosia: the native macOS reader for the gnosia catalog. A SwiftPM
// executable rather than an Xcode project so `swift build` works headless;
// `swift run Gnosia` shows the window, `swift test` runs GnosiaTests. No
// external dependencies — the only other target is CSQLite3, the module map
// that puts the SDK's libsqlite3 under a Swift name.
import PackageDescription

let package = Package(
    name: "Gnosia",
    platforms: [
        .macOS(.v14),
    ],
    products: [
        .executable(name: "Gnosia", targets: ["Gnosia"]),
    ],
    targets: [
        .systemLibrary(
            name: "CSQLite3",
            path: "Sources/CSQLite3"
        ),
        .executableTarget(
            name: "Gnosia",
            dependencies: ["CSQLite3"],
            path: "Sources/Gnosia",
            // AppIcon.png feeds only Scripts/bundle-app.sh's iconset — it is
            // the icon source, not a bundle resource.
            exclude: ["AppIcon.png"],
            resources: [.process("Resources"), .copy("katex"), .copy("note.html"), .copy("chat.html"), .copy("mdcore.js")]
        ),
        // `swift test`: the pure session arithmetic and the learner store's
        // writes, against a learner.db in a temp directory.
        .testTarget(
            name: "GnosiaTests",
            dependencies: ["Gnosia", "CSQLite3"],
            path: "Tests/GnosiaTests"
        ),
    ]
)
