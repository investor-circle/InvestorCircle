import { searchIdeas } from '../../../lib/api';
import IdeaCard from '../../../components/IdeaCard';
import Gate from '../../../components/Gate';

export const revalidate = 60;

// A results page is not itself worth indexing (the ideas it lists are, at
// their own /idea/:id and /security/:symbol URLs) — same call api/seo.js's
// /search page already makes.
export const metadata = {
  title: 'Search investor ideas | My Investor Circle',
  description: 'Search published investment ideas by stock, company or thesis. Every idea is permanent, with entry, target and outcome on the record.',
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }) {
  const { q } = await searchParams;
  const query = String(q || '').slice(0, 80);
  const { ideas } = query ? await searchIdeas(query) : { ideas: [] };

  return (
    <>
      <div className="eyebrow">Search</div>
      <h1>{query ? `Ideas matching "${query}"` : 'Search investor ideas'}</h1>
      <form className="searchbar" method="GET" action="/search">
        <input type="search" name="q" defaultValue={query} placeholder="Try a ticker, a company, or a thesis" aria-label="Search ideas" />
        <button className="btn btn-pri" type="submit">Search</button>
      </form>
      {query && !ideas.length && <p className="lede">No public ideas match &quot;{query}&quot; yet.</p>}
      <div className="idea-row" style={{ padding: 0, marginTop: ideas.length ? 20 : 0 }}>
        {ideas.map((idea) => <IdeaCard key={idea.id} idea={idea} linkTicker />)}
      </div>
      <Gate
        line="Sign in to post an idea, or to follow the members behind these."
        next={query ? `/search?q=${encodeURIComponent(query)}` : '/search'}
      />
    </>
  );
}
