/**
 * The rows of a list to mark as new (they flash once): those that were not in the list shown before and sit above a row that was.
 * Older history listed below the rows shown is not new, nor is a list that fills in all at once (a listing that answered, another
 * filter), and a row that stays on top (an operation still waiting) does not keep the rows arriving below it from being marked.
 * `seen` is the list shown before, null on the first render.
 */
export function freshKeys(seen: ReadonlySet<string> | null, keys: readonly string[]): Set<string> {
  const fresh = new Set<string>();
  if (!seen) return fresh;
  let below = false;
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i] as string;
    if (seen.has(k)) below = true;
    else if (below) fresh.add(k);
  }
  return fresh;
}

/** How long a row marked new flashes (`row-in`: `.table tr.row-new`, src/styles/components.css, and `.op-lines li.row-new`, pages.css) */
export const FLASH_MS = 900;

/**
 * The rows of a list to draw marked as new: each of `fresh` (`freshKeys`) from the render that first marks it for `FLASH_MS`, however
 * often the list is drawn again meanwhile. The mark went with the next render, as the next row arrived or a row's status changed,
 * which ended the flash where it stood, often a third of the way in. `marked` holds when each was first marked, from one render to
 * the next
 */
export function flashing(marked: Map<string, number>, fresh: ReadonlySet<string>, now: number): Set<string> {
  for (const k of fresh) if (!marked.has(k)) marked.set(k, now);
  const shown = new Set<string>();
  for (const [k, at] of marked) {
    if (now - at < FLASH_MS) shown.add(k);
    else marked.delete(k);
  }
  return shown;
}
