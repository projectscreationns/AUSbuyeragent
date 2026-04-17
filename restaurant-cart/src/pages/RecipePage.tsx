import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchRecipe, sendToCart, type Recipe } from '../lib/api';

export default function RecipePage() {
  const { restaurant = '', item = '' } = useParams();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setRecipe(null);
    setError(null);
    fetchRecipe(restaurant, item)
      .then(setRecipe)
      .catch((e) => setError((e as Error).message));
  }, [restaurant, item]);

  async function onSendToCart() {
    if (!recipe) return;
    setSending(true);
    setError(null);
    try {
      const { url, mocked } = await sendToCart(recipe);
      if (mocked) {
        alert(
          'Instacart API key not set - this is a mock URL.\n\n' +
            'Add INSTACART_API_KEY to .env to get a real shoppable cart.\n\n' +
            url
        );
      }
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <Link to={`/r/${encodeURIComponent(restaurant)}`} className="text-white/50 text-sm hover:text-white/80">
        ← Back to {restaurant}
      </Link>

      {error && (
        <div className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm">
          {error}
        </div>
      )}

      {!recipe && !error && (
        <div className="mt-8 text-white/50 text-sm">Generating recipe with Claude...</div>
      )}

      {recipe && (
        <>
          <h1 className="text-3xl font-semibold mt-3">{recipe.title}</h1>
          <p className="text-white/60 mt-2">{recipe.description}</p>
          <div className="text-xs text-white/40 mt-1">Serves {recipe.servings}</div>

          <button
            onClick={onSendToCart}
            disabled={sending}
            className="mt-6 w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-semibold transition"
          >
            {sending ? 'Building cart...' : '🛒 Add all ingredients to Instacart'}
          </button>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Ingredients</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-white/40">•</span>
                  <span>{ing.display_text}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="text-lg font-semibold">Instructions</h2>
            <ol className="mt-3 space-y-2 text-sm list-decimal list-inside">
              {recipe.instructions.map((step, i) => (
                <li key={i} className="text-white/80">
                  {step}
                </li>
              ))}
            </ol>
          </section>

          <p className="mt-10 text-[11px] text-white/40 italic">{recipe.disclaimer}</p>
        </>
      )}
    </div>
  );
}
