import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { generateMenu, generateRecipe, type MenuItem, type Recipe } from './claude.ts';
import { createRecipePage } from './instacart.ts';
import { TTLCache } from './cache.ts';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const menuCache = new TTLCache<MenuItem[]>(24 * 60 * 60 * 1000);
const recipeCache = new TTLCache<Recipe>(7 * 24 * 60 * 60 * 1000);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasAnthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    hasInstacartKey: Boolean(process.env.INSTACART_API_KEY),
  });
});

app.get('/api/menu/:restaurant', async (req, res) => {
  const restaurant = decodeURIComponent(req.params.restaurant);
  try {
    const cached = menuCache.get(restaurant);
    if (cached) return res.json({ items: cached, cached: true });
    const items = await generateMenu(restaurant);
    menuCache.set(restaurant, items);
    res.json({ items, cached: false });
  } catch (err) {
    console.error('menu error', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/recipe/:restaurant/:item', async (req, res) => {
  const restaurant = decodeURIComponent(req.params.restaurant);
  const item = decodeURIComponent(req.params.item);
  const key = `${restaurant}::${item}`;
  try {
    const cached = recipeCache.get(key);
    if (cached) return res.json({ recipe: cached, cached: true });
    const recipe = await generateRecipe(restaurant, item);
    recipeCache.set(key, recipe);
    res.json({ recipe, cached: false });
  } catch (err) {
    console.error('recipe error', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/cart', async (req, res) => {
  const { recipe, linkback } = req.body as { recipe: Recipe; linkback?: string };
  if (!recipe || !recipe.ingredients?.length) {
    return res.status(400).json({ error: 'recipe with ingredients required' });
  }
  try {
    const result = await createRecipePage({
      title: recipe.title,
      instructions: recipe.instructions,
      ingredients: recipe.ingredients,
      linkback,
    });
    res.json(result);
  } catch (err) {
    console.error('cart error', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`[server] http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) console.log('[server] ANTHROPIC_API_KEY not set');
  if (!process.env.INSTACART_API_KEY) console.log('[server] INSTACART_API_KEY not set - /api/cart will return mock URL');
});
