"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { addRecipeAction, removeRecipeAction } from "./actions";
import type { RecipeRow } from "@/lib/db/database.types";

export function RecipesCard({ recipes }: { recipes: RecipeRow[] }) {
  const { showToast } = useToast();
  const [title, setTitle] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");
  const [servings, setServings] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !ingredients.trim()) return;
    setPending(true);
    try {
      await addRecipeAction({ title, ingredients, instructions, servings, sourceUrl });
      setTitle("");
      setIngredients("");
      setInstructions("");
      setServings("");
      setSourceUrl("");
      showToast({ title: "Recipe saved.", variant: "success" });
    } catch (err) {
      showToast({
        title: "Couldn't save that recipe",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Capture recipes here to plan meals with them, or send a photo of a handwritten recipe or a recipe link through
        the intake page — it lands here as a draft to review.
      </p>
      {recipes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recipes saved yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {recipes.map((recipe) => (
            <div key={recipe.id} className="rounded-md border p-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(expandedId === recipe.id ? null : recipe.id)}
                  className="text-left text-sm font-medium hover:underline"
                >
                  {recipe.title}
                  {recipe.servings && <span className="text-muted-foreground"> · serves {recipe.servings}</span>}
                </button>
                <ConfirmDeleteButton
                  action={async () => {
                    await removeRecipeAction(recipe.id);
                  }}
                  label="Remove"
                  size="sm"
                />
              </div>
              {expandedId === recipe.id && (
                <div className="mt-2 flex flex-col gap-2 text-sm">
                  <div>
                    <p className="font-medium text-muted-foreground">Ingredients</p>
                    <p className="whitespace-pre-wrap">{recipe.ingredients}</p>
                  </div>
                  {recipe.instructions && (
                    <div>
                      <p className="font-medium text-muted-foreground">Instructions</p>
                      <p className="whitespace-pre-wrap">{recipe.instructions}</p>
                    </div>
                  )}
                  {recipe.source_url && (
                    <a href={recipe.source_url} target="_blank" rel="noreferrer" className="text-primary underline">
                      Source
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-2 border-t pt-3">
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="recipe-title">Title</Label>
            <Input id="recipe-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weeknight tacos" required />
          </div>
          <div className="flex w-28 flex-col gap-1">
            <Label htmlFor="recipe-servings">Servings</Label>
            <Input id="recipe-servings" type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="recipe-ingredients">Ingredients (one per line)</Label>
          <Textarea
            id="recipe-ingredients"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            placeholder={"1 lb ground beef\n1 packet taco seasoning\n8 tortillas"}
            rows={4}
            required
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="recipe-instructions">Instructions (optional)</Label>
          <Textarea id="recipe-instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={3} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="recipe-source">Source link (optional)</Label>
          <Input id="recipe-source" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
        </div>
        <Button type="submit" disabled={pending || !title.trim() || !ingredients.trim()} size="sm" className="self-start">
          Save recipe
        </Button>
      </form>
    </div>
  );
}
