import CoreGraphics
let l = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as! [[String: Any]]
for w in l where (w["kCGWindowOwnerName"] as? String) == "Google Chrome" && (w["kCGWindowLayer"] as? Int) == 0 {
  print(w["kCGWindowNumber"]!, w["kCGWindowName"] ?? "", w["kCGWindowBounds"]!)
}
