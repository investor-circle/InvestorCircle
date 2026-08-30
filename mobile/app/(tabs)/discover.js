import { useCallback } from "react";
import RecoListScreen from "../../src/components/RecoListScreen";
import { getPublicFeed } from "../../src/services/api/recommendationsApi";
import { mapPublicReco } from "../../src/utils/feed";

// Discover = public recommendations from across the platform (same source as
// the web Pulse "Trending on MIC" / public feed). Server returns them
// newest-first (ORDER BY created_at DESC), so no client-side re-sort needed.
async function loadDiscover() {
  const rows = await getPublicFeed();
  return (rows || []).map(mapPublicReco);
}

export default function DiscoverScreen() {
  const loader = useCallback(() => loadDiscover(), []);
  return (
    <RecoListScreen
      title="Discover"
      loader={loader}
      emptyTitle="Nothing to discover yet"
      emptySubtitle="Public ideas shared across the platform will appear here."
    />
  );
}
