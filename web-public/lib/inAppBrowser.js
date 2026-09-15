// A handful of chat/social apps open shared links in their own embedded
// "mini browser" rather than the visitor's actual default browser — and
// that mini browser has its own cookie jar, isolated from the one holding
// the mic_route routing cookie (see /middleware.js, api/_lib/routingToken.js
// in the main project). A visitor signed in on their real browser looks
// signed-out here through no fault of the routing/auth logic itself: the
// cookie that would tell middleware.js to route them to the real app was
// never going to reach this separate cookie jar in the first place.
//
// Detected so Gate.jsx can point the visitor at their real browser instead
// of just asking them to sign in again for no reason they'd understand.
const IN_APP_UA_SIGNATURES = [
  'WhatsApp',        // WhatsApp's own in-app browser (iOS + Android)
  'FBAN', 'FBAV',    // Facebook app
  'FB_IAB',          // Facebook/Messenger in-app browser
  'Instagram',       // Instagram app
  'Line/',           // LINE app
  'MicroMessenger',  // WeChat
];

export function isInAppBrowser(userAgent) {
  if (!userAgent) return false;
  return IN_APP_UA_SIGNATURES.some((sig) => userAgent.includes(sig));
}
