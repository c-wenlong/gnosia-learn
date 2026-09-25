import CoreGraphics
import Foundation
let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
for w in list where (w["kCGWindowOwnerName"] as? String) == "Google Chrome" {
  let b = w["kCGWindowBounds"] as! [String: Any]
  print(w["kCGWindowNumber"]!, ((w["kCGWindowName"] as? String) ?? "").replacingOccurrences(of: " ", with: "_"), b["X"]!, b["Y"]!, b["Width"]!, b["Height"]!, w["kCGWindowLayer"]!)
}
