// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "GnosiaWeb",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "GnosiaWeb", path: "Sources/GnosiaWeb"),
        // `swift test`: the pure rules the shell's launchers share.
        .testTarget(name: "GnosiaWebTests", dependencies: ["GnosiaWeb"], path: "Tests/GnosiaWebTests"),
    ]
)
