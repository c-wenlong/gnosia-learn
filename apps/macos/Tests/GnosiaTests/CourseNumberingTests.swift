import Foundation
import Testing
@testable import Gnosia

/// A module is numbered by its 1-based place in the course's module list,
/// never its authored `order`: a course whose modules carry order 1 and 3
/// reads "Module 1 of 2" and "Module 2 of 2", rows "1." and "2.". The cases
/// are Fixtures/module-numbers.json, which
/// packages/content/test/module-number.test.ts holds the web's rule to.
@Suite struct CourseNumbering {
    private struct Fixture: Decodable {
        struct Case: Decodable {
            struct Module: Decodable { let id: String; let order: Int; let title: String }
            struct Expected: Decodable { let number: Int; let place: String; let numberedTitle: String }
            let name: String
            let modules: [Module]
            let expected: [Expected]
        }
        let cases: [Case]
    }

    private func fixture() throws -> Fixture {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appending(path: "Fixtures/module-numbers.json")
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
    }

    private func module(_ id: String, _ order: Int, _ title: String) -> CourseModule {
        CourseModule(
            id: id, slug: id, title: title, order: order,
            topic: "", videos: [], items: [], resources: []
        )
    }

    private func course(_ modules: [CourseModule]) -> CatalogCourse {
        CatalogCourse(
            id: "c", slug: "c", code: "CS0000", title: "Course", credits: 0, order: 1,
            inferred: false, prereq: nil, track: nil, notes: nil, capstone: "",
            coverKey: nil, tags: [], modules: modules
        )
    }

    @Test func theFixtureCoversAGap() throws {
        #expect(try fixture().cases.contains { $0.modules.map(\.order) == [1, 3] })
    }

    @Test func everyModuleIsNumberedByItsPlace() throws {
        for c in try fixture().cases {
            let modules = c.modules.map { module($0.id, $0.order, $0.title) }
            let shown = course(modules)
            let got = modules.map { m in
                (shown.number(of: m), shown.place(of: m), shown.numberedTitle(of: m))
            }
            #expect(got.map(\.0) == c.expected.map(\.number), "\(c.name)")
            #expect(got.map(\.1) == c.expected.map(\.place), "\(c.name)")
            #expect(got.map(\.2) == c.expected.map(\.numberedTitle), "\(c.name)")
        }
    }

    @Test func paletteStepHoldsAtTheEnds() {
        let order = ["a", "b", "c"]
        #expect(paletteStep(order, from: "b", by: 1) == "c")
        #expect(paletteStep(order, from: "c", by: 1) == "c")
        #expect(paletteStep(order, from: "a", by: -1) == "a")
        #expect(paletteStep(order, from: nil, by: 1) == "a")
        #expect(paletteStep(order, from: "gone", by: -1) == "c")
        #expect(paletteStep([String](), from: nil, by: 1) == nil)
    }
}
