import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import restaurants from '../data/restaurants.json';

type Restaurant = { name: string; cuisine: string; emoji: string };

export default function RestaurantGrid() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const filtered = useMemo<Restaurant[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return restaurants as Restaurant[];
    return (restaurants as Restaurant[]).filter(
      (r) => r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q)
    );
  }, [query]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/r/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="mb-8">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or type any restaurant, then press Enter..."
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-white/30 focus:outline-none"
        />
        <p className="text-xs text-white/40 mt-2">
          Don't see your spot? Type it in and hit Enter — we'll generate a menu for anything.
        </p>
      </form>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {filtered.map((r) => (
          <Link
            key={r.name}
            to={`/r/${encodeURIComponent(r.name)}`}
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 transition"
          >
            <div className="text-3xl">{r.emoji}</div>
            <div className="mt-2 font-medium">{r.name}</div>
            <div className="text-xs text-white/50">{r.cuisine}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
