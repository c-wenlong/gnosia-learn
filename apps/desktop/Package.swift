// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "HermesWeb",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "HermesWeb", path: "Sources/HermesWeb"),
        // `swift test`: the pure rules the shell's launchers share.
        .testTarget(name: "HermesWebTests", dependencies: ["HermesWeb"], path: "Tests/HermesWebTests"),
    ]
)
