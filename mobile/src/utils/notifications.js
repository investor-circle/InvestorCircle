// Notification display text + icon — plain-string port of the web
// NotificationPanel's notifText()/TYPE_LABEL (src/features/notifications).
// Kept as plain strings (no JSX/bold) suited to native <Text>.
const TYPE_LABEL = {
  connection_request: "wants to connect with you",
  connection_accepted: "accepted your connection request",
  connection_rejected: "declined your connection request",
  group_added: "added you to a Circle",
  group_member_exit: "left your Circle",
  circle_join_request: "requested to join your Circle",
  circle_join_approved: "approved your request to join their Circle",
  circle_join_rejected: "declined your request to join their Circle",
  tracking_new: "started tracking you",
  recommendation: "shared an idea with you",
  circle_idea: "shared an idea in a Circle",
  exit_signal: "issued an exit signal",
  idea_expired: "expired",
  idea_expiring_today: "expires today",
  contact_recommendation: "posted a new idea",
  contact_comment: "commented on your idea",
  contact_like: "liked your idea",
  network_like: "liked an idea",
  network_comment: "commented on an idea",
};

export function notifText(n) {
  const who = n.from_name || "Someone";
  const ticker = n.metadata?.ticker ? ` ${n.metadata.ticker}` : "";
  const by = n.metadata?.recommenderName ? ` by ${n.metadata.recommenderName}` : "";

  switch (n.type) {
    case "contact_like": {
      const names = n.metadata?.likerNames || [who];
      const count = n.metadata?.likeCount || 1;
      const whoTxt =
        count === 1 ? names[0] : count === 2 && names.length >= 2 ? `${names[0]} and ${names[1]}` : `${names[0]} and ${count - 1} others`;
      return `${whoTxt} liked your${ticker || ""} idea`;
    }
    case "tracking_new": {
      const count = n.metadata?.count || 1;
      const lead = n.metadata?.leadName || who;
      return count <= 1 ? `${lead} started tracking you` : `${lead} + ${count - 1} new investor${count - 1 === 1 ? "" : "s"} started tracking you`;
    }
    case "circle_idea": {
      const g = n.metadata?.groupName;
      return `${who} shared an idea${g ? ` in ${g}` : " in a Circle"}${ticker ? ` —${ticker}` : ""}`;
    }
    case "network_like":
      return `${who} liked${ticker}${by}`;
    case "network_comment":
      return `${who} commented on${ticker || " an idea"}${by}`;
    case "exit_signal":
      return `${who} exited${ticker || " a tracked idea"}${by}`;
    case "idea_expired":
      return `${ticker || "An idea you track"}${by} has expired`;
    case "idea_expiring_today":
      return `Your idea${ticker} expires today`;
    case "contact_comment":
      return `${who} commented on your${ticker} idea`;
    case "contact_recommendation":
      return `${who} posted a new idea${ticker ? ` —${ticker}` : ""}`;
    default: {
      const label = TYPE_LABEL[n.type] || n.type;
      const g = n.metadata?.groupName ? ` — ${n.metadata.groupName}` : "";
      return `${who} ${label}${ticker ? ` —${ticker}` : ""}${g}`;
    }
  }
}

// Ionicons name for a notification row's leading icon.
export function notifIcon(type) {
  if (type?.includes("like")) return "heart";
  if (type?.includes("comment")) return "chatbubble";
  if (type?.startsWith("connection")) return "person-add";
  if (type?.startsWith("circle") || type?.startsWith("group")) return "people";
  if (type?.startsWith("tracking")) return "bookmark";
  if (type === "exit_signal" || type?.startsWith("idea")) return "trending-up";
  return "notifications";
}

// A reco reference this notification points at (for deep-linking to detail).
export function notifRecoId(n) {
  const engagementTypes = [
    "contact_like",
    "contact_comment",
    "network_like",
    "network_comment",
    "contact_recommendation",
    "circle_idea",
    "recommendation",
    "exit_signal",
    "idea_expired",
    "idea_expiring_today",
  ];
  return engagementTypes.includes(n.type) && n.reference_id ? String(n.reference_id) : null;
}
