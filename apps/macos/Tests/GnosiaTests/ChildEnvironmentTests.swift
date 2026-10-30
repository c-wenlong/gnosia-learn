import Foundation
import Testing
@testable import Gnosia

/// S9-08: the launchers' shared environment, as the app reads the resolver's answer.
@Suite struct ChildEnvironmentRead {
    @Test func oneObjectOfStringsAfterWhateverTheShellPrinted() {
        let out = Data("nvm: using node 22\n{\"CATALOG_DB\":\"/x/catalog.db\",\"STUDIO_DAILY_USD\":\"5\"}\n".utf8)
        #expect(ChildEnvironment.parse(out) == ["CATALOG_DB": "/x/catalog.db", "STUDIO_DAILY_USD": "5"])
        #expect(ChildEnvironment.parse(Data("{\"PORT\":7250}".utf8)) == nil)
        #expect(ChildEnvironment.parse(Data("child-env: failed\n".utf8)) == nil)
    }
}
