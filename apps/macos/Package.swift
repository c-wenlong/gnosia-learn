// swift-tools-version: 6.0
//
// Gnosia: the native macOS reader for the gnosia catalog. A SwiftPM
// executable rather than an Xcode project so `swift build` works headless;
// `swift run Gnosia` shows the window. No external dependencies — the only
// target beside the app is CSQLite3, the module map that puts the SDK's
// libsqlite3 under a Swift name.
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
            path: "Sources/Gnosia"
        ),
    ]
)
