import Testing
@testable import Gnosia

/// The module page's header and the sidebar row name the same number: the
/// module's authored `order`, as the web's ModuleMain ("Module {order} of
/// {count}") and CourseSidebar ("{order}. {title}") print it.
@Suite struct CourseNumbering {
    private func module(_ order: Int, _ title: String) -> CourseModule {
        CourseModule(
            id: "m\(order)", slug: "m\(order)", title: title, order: order,
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

    @Test func aGapInTheOrderShowsTheSameNumberInHeaderAndRow() {
        let last = module(3, "Agentic frameworks")
        let c = course([module(1, "Foundations"), last])
        #expect(c.place(of: last) == "Module 3 of 2")
        #expect(last.numberedTitle == "3. Agentic frameworks")
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
