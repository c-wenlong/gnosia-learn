//
//  NotificationBridge.swift
//  GnosiaWeb
//
//  WKWebView has no `Notification`, so the studio's "your diagram is ready"
//  never showed in the window (JobsProvider checks for one and skips). This
//  gives the page a small one: a user script defines `Notification` with
//  `permission`, `requestPermission()` and a constructor, and each posts a
//  message to one script message handler, which answers with the
//  notification center's permission or posts a notification.
//
//  What page script can reach through it is a notification, and nothing
//  else: the handler takes three message kinds, reads only a title and a
//  body as plain strings, cuts them to a length, and hands them to
//  UNUserNotificationCenter as text (no HTML anywhere, no URL, no action).
//  It answers only the main frame of the app's own origin, so a framed page
//  (the studio's live canvas on another loopback port) cannot post one.
//

import AppKit
import Foundation
import UserNotifications
import WebKit

/// What the page's `Notification` asks for.
enum NotificationRequest: Equatable {
    /// `Notification.permission`'s value, read at load.
    case permission
    /// `Notification.requestPermission()`: ask, the first time.
    case requestPermission
    /// `new Notification(title, { body })`.
    case show(title: String, body: String)
}

/// The longest title and body the bridge passes on; the rest is cut.
let notificationTitleLimit = 200
let notificationBodyLimit = 1000

/// The message the shim posts, read as a pure rule: a dictionary with a
/// known `kind`, and for `show` a string `title` and an optional string
/// `body`. Anything else is nil and does nothing.
func notificationRequest(from body: Any) -> NotificationRequest? {
    guard let message = body as? [String: Any], let kind = message["kind"] as? String else { return nil }
    switch kind {
    case "permission":
        return .permission
    case "requestPermission":
        return .requestPermission
    case "show":
        guard let title = message["title"] as? String else { return nil }
        let text: String
        switch message["body"] {
        case nil, is NSNull: text = ""
        case let value as String: text = value
        default: return nil
        }
        return .show(title: String(title.prefix(notificationTitleLimit)), body: String(text.prefix(notificationBodyLimit)))
    default:
        return nil
    }
}

/// The page's `Notification.permission` for an authorization status.
func notificationPermission(for status: UNAuthorizationStatus) -> String {
    switch status {
    case .authorized, .provisional, .ephemeral: return "granted"
    case .denied: return "denied"
    case .notDetermined: return "default"
    @unknown default: return "denied"
    }
}

/// Whether a message's frame may use the bridge: the main frame, on the
/// app's own origin.
func acceptsNotificationMessage(isMainFrame: Bool, origin: URL?, appOrigin: URL) -> Bool {
    guard isMainFrame, let origin else { return false }
    let scheme = origin.scheme?.lowercased()
    return (scheme == "http" || scheme == "https") && sameOrigin(origin, appOrigin)
}

/// A frame's security origin as a URL, or nil when it has no host (an
/// opaque origin). Port 0 is the scheme's default.
func originURL(protocol scheme: String, host: String, port: Int) -> URL? {
    guard !scheme.isEmpty, !host.isEmpty else { return nil }
    var components = URLComponents()
    components.scheme = scheme
    components.host = host.contains(":") && !host.hasPrefix("[") ? "[\(host)]" : host
    if port != 0 { components.port = port }
    return components.url
}

@MainActor
final class NotificationBridge: NSObject, WKScriptMessageHandlerWithReply, UNUserNotificationCenterDelegate {
    nonisolated static let handlerName = "gnosiaNotification"
    static let shared = NotificationBridge()

    /// The notification center needs an app bundle: in an unbundled
    /// `swift run`, or the test runner, `UNUserNotificationCenter.current()`
    /// throws, so the window there gets no `Notification`, as before.
    nonisolated static var isAvailable: Bool {
        Bundle.main.bundleURL.pathExtension == "app" && Bundle.main.bundleIdentifier != nil
    }

    /// Adds the shim and the handler to a configuration's controller.
    static func install(in controller: WKUserContentController) {
        controller.addUserScript(WKUserScript(
            source: notificationShimSource, injectionTime: .atDocumentStart, forMainFrameOnly: true, in: .page
        ))
        controller.addScriptMessageHandler(shared, contentWorld: .page, name: handlerName)
    }

    private var center: UNUserNotificationCenter {
        let center = UNUserNotificationCenter.current()
        if center.delegate == nil { center.delegate = self }
        return center
    }

    func userContentController(
        _ controller: WKUserContentController, didReceive message: WKScriptMessage
    ) async -> (Any?, String?) {
        let security = message.frameInfo.securityOrigin
        let origin = originURL(protocol: security.protocol, host: security.host, port: security.port)
        guard let coordinator = message.webView?.navigationDelegate as? WebView.Coordinator,
              acceptsNotificationMessage(isMainFrame: message.frameInfo.isMainFrame, origin: origin,
                                         appOrigin: coordinator.origin),
              let request = notificationRequest(from: message.body)
        else { return (nil, "refused") }
        switch request {
        case .permission:
            return (notificationPermission(for: await center.notificationSettings().authorizationStatus), nil)
        case .requestPermission:
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
            return (notificationPermission(for: await center.notificationSettings().authorizationStatus), nil)
        case .show(let title, let body):
            guard notificationPermission(for: await center.notificationSettings().authorizationStatus) == "granted"
            else { return (nil, nil) }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            try? await center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
            return (nil, nil)
        }
    }

    /// Shown while the app is active too: the page asks only when its window
    /// is hidden or unfocused, which can be with another Gnosia window in
    /// front.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .list, .sound]
    }
}

/// The page's `Notification`, defined only where the page has none (inside
/// the shell). It keeps the permission it last heard, so `permission` reads
/// synchronously as the web API's does, and posts only `kind`, `title` and
/// `body`.
let notificationShimSource = """
(() => {
  if (typeof window.Notification !== "undefined") return;
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.\(NotificationBridge.handlerName);
  if (!handler) return;
  let permission = "default";
  const heard = (value) => {
    if (value === "granted" || value === "denied" || value === "default") permission = value;
    return permission;
  };
  class Notification {
    constructor(title, options) {
      this.title = String(title);
      this.body = options && options.body != null ? String(options.body) : "";
      this.tag = options && options.tag != null ? String(options.tag) : "";
      this.onclick = null;
      this.onclose = null;
      this.onerror = null;
      this.onshow = null;
      if (permission === "granted") {
        handler.postMessage({ kind: "show", title: this.title, body: this.body }).catch(() => undefined);
      }
    }
    static get permission() { return permission; }
    static requestPermission(callback) {
      const asked = handler.postMessage({ kind: "requestPermission" }).then(heard, () => permission);
      if (typeof callback === "function") asked.then(callback);
      return asked;
    }
    close() {}
    addEventListener() {}
    removeEventListener() {}
  }
  Object.defineProperty(window, "Notification", { value: Notification, configurable: true, writable: true });
  handler.postMessage({ kind: "permission" }).then(heard, () => undefined);
})();
"""
