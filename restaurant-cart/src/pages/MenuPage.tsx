import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchMenu, type MenuItem } from '../lib/api';

export default function MenuPage() {
  const { restaurant = '' } = useParams();
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(null);
    setError(null);
    fetchMenu(restaurant)
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, [restaurant]);

  return (
    <div>
      <Link to="/" className="text-white/50 text-sm hover:text-white/80">
        ← Back to restaurants
      </Link>
      <h1 className="text-3xl font-semibold mt-3">{restaurant}</h1>
      <p className="text-white/50 text-sm mt-1">Pick a dish to see its copycat recipe.</p>

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm">
          {error}
        </div>
      )}

      {!items && !error && (
        <div className="mt-8 text-white/50 text-sm">Generating menu with Claude...</div>
      )}

      {items && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
          {items.map((it) => (
            <Link
              key={it.name}
              to={`/r/${encodeURIComponent(restaurant)}/${encodeURIComponent(it.name)}`}
              className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 transition"
            >
              <div className="text-xs uppercase tracking-wide text-white/40">{it.category}</div>
              <div className="font-medium mt-1">{it.name}</div>
              <div className="text-sm text-white/60 mt-1">{it.description}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
