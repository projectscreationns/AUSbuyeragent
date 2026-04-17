export type MenuItem = { name: string; description: string; category: string };

export type Ingredient = {
  name: string;
  quantity: number;
  unit: string;
  display_text: string;
};

export type Recipe = {
  title: string;
  description: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: string[];
  disclaimer: string;
};

async function jsonOrThrow<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(body || resp.statusText);
  }
  return (await resp.json()) as T;
}

export async function fetchMenu(restaurant: string): Promise<MenuItem[]> {
  const r = await fetch(`/api/menu/${encodeURIComponent(restaurant)}`);
  const data = await jsonOrThrow<{ items: MenuItem[] }>(r);
  return data.items;
}

export async function fetchRecipe(restaurant: string, item: string): Promise<Recipe> {
  const r = await fetch(`/api/recipe/${encodeURIComponent(restaurant)}/${encodeURIComponent(item)}`);
  const data = await jsonOrThrow<{ recipe: Recipe }>(r);
  return data.recipe;
}

export async function sendToCart(recipe: Recipe): Promise<{ url: string; mocked: boolean }> {
  const r = await fetch('/api/cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipe, linkback: window.location.href }),
  });
  return jsonOrThrow<{ url: string; mocked: boolean }>(r);
}
