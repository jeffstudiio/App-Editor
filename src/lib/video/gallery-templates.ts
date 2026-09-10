// Browsable gallery layer on top of the edit-recipe templates:
// categories (like CapCut's template tabs), featured flags and card art.

import { EDIT_TEMPLATES } from "./templates";

export interface GalleryCategory {
  id: string;
  label: string;
}

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  { id: "foryou", label: "برای تو" },
  { id: "trend", label: "پرطرفدار" },
  { id: "product", label: "ریلز محصول" },
  { id: "cinematic", label: "سینمایی" },
  { id: "vlog", label: "ولاگ" },
  { id: "learn", label: "آموزش" },
  { id: "fashion", label: "مود و استایل" },
  { id: "sport", label: "ورزش" },
  { id: "travel", label: "سفر" },
  { id: "party", label: "تولد و جشن" },
  { id: "love", label: "عاشقانه" },
  { id: "motivation", label: "انگیزشی" },
  { id: "food", label: "غذا" },
  { id: "gaming", label: "گیمینگ" },
  { id: "music", label: "موزیک" },
  { id: "family", label: "خانواده" },
  { id: "funny", label: "طنز" },
  { id: "tech", label: "تکنولوژی" },
];

export interface GalleryEntry {
  recipeId: string;
  categories: string[];
  featured?: boolean;
  /** card art: tailwind gradient stops + emoji watermark */
  art: { from: string; to: string; emoji: string; label?: string };
  estDur: string;
}

export const GALLERY: GalleryEntry[] = [
  { recipeId: "product-reel", categories: ["product", "trend", "foryou"], featured: true, art: { from: "from-violet-500", to: "to-fuchsia-400", emoji: "🛍️" }, estDur: "۱۵ ثانیه" },
  { recipeId: "before-after", categories: ["trend", "foryou"], featured: true, art: { from: "from-slate-600", to: "to-slate-300", emoji: "🔄" }, estDur: "۲۰ ثانیه" },
  { recipeId: "cinematic-teaser", categories: ["cinematic", "foryou"], featured: true, art: { from: "from-slate-800", to: "to-cyan-700", emoji: "🎞️" }, estDur: "۳۰ ثانیه" },
  { recipeId: "talking-head", categories: ["learn", "foryou"], featured: true, art: { from: "from-sky-600", to: "to-indigo-400", emoji: "🗣️" }, estDur: "۶۰ ثانیه" },
  { recipeId: "neon-night", categories: ["trend", "music"], art: { from: "from-fuchsia-600", to: "to-indigo-700", emoji: "💜" }, estDur: "۲۰ ثانیه" },
  { recipeId: "daily-vlog", categories: ["vlog", "foryou"], featured: true, art: { from: "from-amber-500", to: "to-rose-400", emoji: "🌤️" }, estDur: "۴۵ ثانیه" },
  { recipeId: "fashion-look", categories: ["fashion", "trend"], featured: true, art: { from: "from-emerald-400", to: "to-cyan-500", emoji: "👗" }, estDur: "۱۵ ثانیه" },
  { recipeId: "sports-pump", categories: ["sport", "motivation"], art: { from: "from-zinc-700", to: "to-red-500", emoji: "🏋️" }, estDur: "۳۰ ثانیه" },
  { recipeId: "travel-diary", categories: ["travel", "vlog"], featured: true, art: { from: "from-orange-400", to: "to-sky-500", emoji: "✈️" }, estDur: "۶۰ ثانیه" },
  { recipeId: "birthday-pop", categories: ["party", "family"], art: { from: "from-pink-500", to: "to-yellow-400", emoji: "🎂" }, estDur: "۲۵ ثانیه" },
  { recipeId: "love-remix", categories: ["love", "music"], art: { from: "from-rose-400", to: "to-amber-300", emoji: "💗" }, estDur: "۳۰ ثانیه" },
  { recipeId: "motivation-grit", categories: ["motivation", "trend"], featured: true, art: { from: "from-neutral-800", to: "to-neutral-500", emoji: "🔥" }, estDur: "۳۰ ثانیه" },
  { recipeId: "food-closeup", categories: ["food", "vlog"], featured: true, art: { from: "from-amber-600", to: "to-orange-400", emoji: "🍜" }, estDur: "۲۰ ثانیه" },
  { recipeId: "gaming-hype", categories: ["gaming", "trend"], art: { from: "from-violet-700", to: "to-emerald-400", emoji: "🎮" }, estDur: "۲۰ ثانیه" },
  { recipeId: "lyrics-cards", categories: ["music", "trend"], art: { from: "from-slate-900", to: "to-fuchsia-600", emoji: "🎵" }, estDur: "۴۵ ثانیه" },
  { recipeId: "family-moments", categories: ["family", "love"], art: { from: "from-amber-400", to: "to-rose-300", emoji: "👨‍👩‍👧" }, estDur: "۶۰ ثانیه" },
  { recipeId: "friends-recap", categories: ["family", "trend"], art: { from: "from-sky-500", to: "to-lime-400", emoji: "🤝" }, estDur: "۳۰ ثانیه" },
  { recipeId: "comedy-zoom", categories: ["funny", "trend"], featured: true, art: { from: "from-yellow-400", to: "to-red-400", emoji: "😂" }, estDur: "۲۰ ثانیه" },
  { recipeId: "unboxing", categories: ["product", "tech"], art: { from: "from-teal-500", to: "to-violet-400", emoji: "📦" }, estDur: "۳۰ ثانیه" },
  { recipeId: "study-focus", categories: ["learn", "motivation"], art: { from: "from-emerald-500", to: "to-teal-300", emoji: "📚" }, estDur: "۶۰ ثانیه" },
  { recipeId: "recipe-steps", categories: ["food", "learn"], art: { from: "from-orange-500", to: "to-amber-300", emoji: "🥘" }, estDur: "۴۵ ثانیه" },
  { recipeId: "street-style", categories: ["fashion", "music"], art: { from: "from-gray-800", to: "to-fuchsia-500", emoji: "🧢" }, estDur: "۲۰ ثانیه" },
  { recipeId: "car-reveal", categories: ["cinematic", "tech"], art: { from: "from-slate-700", to: "to-cyan-400", emoji: "🚗" }, estDur: "۳۰ ثانیه" },
  { recipeId: "pet-cute", categories: ["funny", "family"], art: { from: "from-amber-300", to: "to-orange-400", emoji: "🐱" }, estDur: "۲۰ ثانیه" },
  { recipeId: "quote-card", categories: ["motivation", "cinematic"], art: { from: "from-neutral-900", to: "to-neutral-600", emoji: "🖤" }, estDur: "۳۰ ثانیه" },
  { recipeId: "week-recap", categories: ["vlog", "motivation"], art: { from: "from-emerald-400", to: "to-sky-400", emoji: "📅" }, estDur: "۴۵ ثانیه" },
  { recipeId: "hype-intro", categories: ["cinematic", "music"], art: { from: "from-indigo-900", to: "to-yellow-400", emoji: "⚡️" }, estDur: "۱۰ ثانیه" },
  { recipeId: "slow-mood", categories: ["cinematic", "love"], art: { from: "from-slate-700", to: "to-rose-300", emoji: "🌫️" }, estDur: "۶۰ ثانیه" },
  { recipeId: "makeup-glow", categories: ["fashion", "learn"], art: { from: "from-rose-400", to: "to-amber-200", emoji: "💄" }, estDur: "۳۰ ثانیه" },
  { recipeId: "tech-review", categories: ["tech", "learn"], art: { from: "from-blue-500", to: "to-cyan-300", emoji: "📱" }, estDur: "۶۰ ثانیه" },
];

export interface GalleryItem {
  recipe: (typeof EDIT_TEMPLATES)[number];
  entry: GalleryEntry;
}

export function galleryItems(categoryId: string, query: string): GalleryItem[] {
  const q = query.trim();
  return GALLERY.map((entry) => ({
    recipe: EDIT_TEMPLATES.find((t) => t.id === entry.recipeId)!,
    entry,
  }))
    .filter((it) => it.recipe)
    .filter((it) => (categoryId === "foryou" ? true : it.entry.categories.includes(categoryId)))
    .filter((it) =>
      !q ? true : it.recipe.name.includes(q) || it.recipe.desc.includes(q) || it.entry.categories.some((c) => c.includes(q))
    )
    .sort((a, b) => Number(!!b.entry.featured) - Number(!!a.entry.featured));
}

export function galleryItemById(recipeId: string): GalleryItem | null {
  const entry = GALLERY.find((g) => g.recipeId === recipeId);
  const recipe = EDIT_TEMPLATES.find((t) => t.id === recipeId);
  return entry && recipe ? { entry, recipe } : null;
}
