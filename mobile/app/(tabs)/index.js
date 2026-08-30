import { useCallback } from "react";
import RecoListScreen from "../../src/components/RecoListScreen";
import {
  getMyReceivedRecos,
  getPublicFeed,
  getNetworkEngagementFeed,
} from "../../src/services/api/recommendationsApi";
import { getMyConnections } from "../../src/services/api/connectionsApi";
import { getFeedConfigAndPrefs, getMyTrackedRecoIds } from "../../src/services/api/feedApi";
import {
  buildFeed,
  computeEffectiveFeedConfig,
  mapPublicReco,
  mapNetworkReco,
} from "../../src/utils/feed";

// Feed = the same three-source merge the web Feed tab does (direct received +
// network-engagement + public), deduped, filtered by the effective feed
// config, and ranked by scoreFeedRec. See src/utils/feed.js for the shared
// composition that mirrors the web behaviour.
async function loadFeed() {
  // Independent round-trips fire concurrently (received, public, connections,
  // feed-config, tracked-ids) — none depends on another. Network-engagement
  // is the only sequential step: it needs the active connection ids and the
  // resolved config to know whether it's even enabled.
  const [received, publicRaw, connections, feedCfg, trackedIds] = await Promise.all([
    getMyReceivedRecos(),
    getPublicFeed(),
    getMyConnections(),
    getFeedConfigAndPrefs(),
    getMyTrackedRecoIds(),
  ]);

  const cfg = computeEffectiveFeedConfig(feedCfg.options, feedCfg.prefs);
  const activeConns = (connections || []).filter((c) => c.status === "active");
  const contactIds = new Set(activeConns.map((c) => c.user_id));

  let networkRecos = [];
  if (cfg.src_network_engagement && activeConns.length > 0) {
    const networkRaw = await getNetworkEngagementFeed(activeConns.map((c) => c.user_id));
    networkRecos = networkRaw.map(mapNetworkReco);
  }

  return buildFeed({
    received,
    networkRecos,
    publicRecos: (publicRaw || []).map(mapPublicReco),
    cfg,
    trackedIds,
    contactIds,
  });
}

export default function FeedScreen() {
  const loader = useCallback(() => loadFeed(), []);
  return (
    <RecoListScreen
      title="Feed"
      loader={loader}
      emptyTitle="No ideas yet"
      emptySubtitle="Recommendations from your circle and across the platform will show up here."
    />
  );
}
