// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "GnosiaWeb",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "GnosiaWeb", path: "Sources/GnosiaWeb")
    ]
)
