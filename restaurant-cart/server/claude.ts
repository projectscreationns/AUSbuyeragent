import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

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

const MENU_SYSTEM = `You output JSON only. No prose, no markdown fences.
Given a restaurant name, return up to 12 of its most popular menu items.
Paraphrase descriptions in your own words - do not copy official menu text verbatim.
Schema: {"items":[{"name":"...","description":"...","category":"Tacos|Burgers|..."}]}`;

const RECIPE_SYSTEM = `You output JSON only. No prose, no markdown fences.
Given "{restaurant}: {menu item}", return a copycat home recipe.
Ingredient names must be grocery-store friendly (e.g. "boneless skinless chicken thighs" not "chicken").
Every ingredient needs a numeric quantity and a unit ("lb", "oz", "cup", "tbsp", "tsp", "each", "cloves", etc).
Schema: {
  "title": "...",
  "description": "1-2 sentence paraphrased description",
  "servings": 4,
  "ingredients": [{"name":"...", "quantity":1.5, "unit":"lb", "display_text":"1 1/2 lbs boneless chicken thighs"}],
  "instructions": ["step 1", "step 2", ...],
  "disclaimer": "Fan copycat approximation. Not affiliated with, endorsed by, or licensed by {restaurant}."
}`;

function stripFences(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

async function callJSON<T>(system: string, user: string): Promise<T> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
  });
  const block = resp.content.find((c) => c.type === 'text');
  if (!block || block.type !== 'text') throw new Error('No text in response');
  return JSON.parse(stripFences(block.text)) as T;
}

export async function generateMenu(restaurant: string): Promise<MenuItem[]> {
  const data = await callJSON<{ items: MenuItem[] }>(MENU_SYSTEM, restaurant);
  return data.items.slice(0, 12);
}

export async function generateRecipe(restaurant: string, item: string): Promise<Recipe> {
  const user = `${restaurant}: ${item}`;
  const recipe = await callJSON<Recipe>(RECIPE_SYSTEM, user);
  recipe.disclaimer = `Fan copycat approximation. Not affiliated with, endorsed by, or licensed by ${restaurant}.`;
  return recipe;
}
