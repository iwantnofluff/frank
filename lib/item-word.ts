// What a project's pieces are called (direct instruction, 10 Nov 2026): a
// Project's are assets, a Content Planner's posts.
export type Delivery = "scheduled" | "continuous";

export interface ItemWord {
  one: string; // "Asset", "Post"
  lower: string; // "asset", "post"
  many: string; // "Assets", "Posts"
  manyLower: string; // "assets", "posts"
}

const POST: ItemWord = { one: "Post", lower: "post", many: "Posts", manyLower: "posts" };
const ASSET: ItemWord = { one: "Asset", lower: "asset", many: "Assets", manyLower: "assets" };

export function itemWord(delivery: Delivery | null | undefined): ItemWord {
  return delivery === "continuous" ? ASSET : POST;
}
