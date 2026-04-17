import type { Ingredient } from './claude.ts';

const BASE = process.env.INSTACART_BASE_URL ?? 'https://connect.dev.instacart.tools';

type InstacartIngredient = {
  name: string;
  display_text?: string;
  measurements?: { quantity: number; unit: string }[];
};

type CreateRecipeBody = {
  title: string;
  image_url?: string;
  link_type: 'recipe';
  instructions?: string[];
  ingredients: InstacartIngredient[];
  landing_page_configuration?: {
    partner_linkback_url?: string;
    enable_pantry_items?: boolean;
  };
};

export type CartResult = { url: string; mocked: boolean };

export async function createRecipePage(args: {
  title: string;
  instructions: string[];
  ingredients: Ingredient[];
  linkback?: string;
}): Promise<CartResult> {
  const apiKey = process.env.INSTACART_API_KEY;

  if (!apiKey) {
    const mockUrl = `https://www.instacart.com/store/recipes/mock?title=${encodeURIComponent(args.title)}`;
    return { url: mockUrl, mocked: true };
  }

  const body: CreateRecipeBody = {
    title: args.title,
    link_type: 'recipe',
    instructions: args.instructions,
    ingredients: args.ingredients.map((i) => ({
      name: i.name,
      display_text: i.display_text,
      measurements: [{ quantity: i.quantity, unit: i.unit }],
    })),
    landing_page_configuration: {
      partner_linkback_url: args.linkback,
      enable_pantry_items: true,
    },
  };

  const resp = await fetch(`${BASE}/idp/v1/products/recipe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Instacart ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as { products_link_url: string };
  return { url: data.products_link_url, mocked: false };
}
