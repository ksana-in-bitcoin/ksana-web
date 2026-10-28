import { useEffect, useRef, useState } from 'react';
import { useChain } from '../app/store';
import type { HistoryKey, HistoryState } from '../chain/rpc/chain';
import { fmtInt } from '../lib/format';
import { useT, type Messages } from '../i18n';
import { Button } from './ui';

/**
 * Above a list of operations on the node data source (`of`: the account whose operations it lists, or `latest`). While the
 * list is not full this asks for more: the node lists the operations page by page (D-111) up to a budget, with a button to
 * list further when a filter leaves the list short. From a node without the listings the page reads the chain block by block
 * from the tip instead (D-110), and this says how far down it has read until that reaches the genesis block, with a button to
 * read further. Once a reader has asked for older rows than the list's first (`grown`, `OlderRows`), it says all this below the
 * list instead, where the reader is.
 */
export function HistoryReach({ of, full, grown = false }: { of: HistoryKey; full: boolean; grown?: boolean }) {
  const sim = useChain();
  const rpc = sim.kind === 'rpc' ? sim : null;
  // On every render: the listing lapses, and the blocks it brought may be pruned, unless the page keeps asking while it shows the list
  useEffect(() => {
    rpc?.wantHistory(of, !full);
  });
  return grown ? null : <ReachNote of={of} full={full} />;
}

/**
 * What a history view says of how far its list reaches, and the label of the button that has the node read further where it has
 * one: while it reads, after a failure, and where a list that is not full has stopped short of the genesis block (D-110) or of the
 * listing's end (D-111). Above the list (`HistoryReach`) or below it (`OlderRows`)
 */
export function reachWords(reach: HistoryState, full: boolean, h: Messages['ui']['history']): { words: string; more?: string } | undefined {
  if (reach.source === 'blocks') {
    if (reach.from === 0) return undefined;
    if (reach.loading) return { words: h.reading(fmtInt(reach.from)) };
    return full ? undefined : { words: h.from(fmtInt(reach.from)), more: h.earlier };
  }
  if (reach.loading) return { words: h.listing };
  if (reach.error) return { words: h.failed(reach.error), more: h.retry };
  return full || !reach.paused ? undefined : { words: h.listed(fmtInt(reach.listed)), more: h.older };
}

/** What a history view says of how far its list reaches, above the list */
function ReachNote({ of, full }: { of: HistoryKey; full: boolean }) {
  const sim = useChain();
  const t = useT();
  const rpc = sim.kind === 'rpc' ? sim : null;
  const says = rpc?.ready ? reachWords(rpc.history(of), full, t.ui.history) : undefined;
  if (!rpc || !says) return null;
  if (!says.more) {
    return (
      <p className="small muted section-note" aria-live="polite">
        {says.words}
      </p>
    );
  }
  return (
    <div className="row wrap small muted section-note">
      <span>{says.words}</span>
      <Button size="sm" onClick={() => rpc.loadEarlier(of)}>
        {says.more}
      </Button>
    </div>
  );
}

/**
 * How many rows a history list shows: `base` at first, `base` more each time a reader asks for older ones (`OlderRows`), and `base`
 * again once the list's `key` changes (another account, another filter). The list takes one row beyond those it shows, which tells
 * that an older one is there
 */
export function useShownRows(base: number, key: string): { shown: number; grown: boolean; more: () => void } {
  const [state, setState] = useState({ key, shown: base });
  // Set while drawing, as React has it for state that follows a prop: going back to a list it had grown drew it grown again
  if (state.key !== key) setState({ key, shown: base });
  const shown = state.key === key ? state.shown : base;
  return { shown, grown: shown > base, more: () => setState({ key, shown: shown + base }) };
}

/**
 * Whether a history list that took `listed` rows to show `shown` has older ones to show: one the page holds beyond them, or, the
 * list being full, one the node lists further (D-111) or holds in blocks below those read (D-110). Not while it fills
 */
export function olderBeyond(listed: number, shown: number, reach: HistoryState | undefined): boolean {
  if (listed > shown) return true;
  if (listed < shown || !reach) return false;
  return reach.source === 'listing' ? !reach.complete : reach.from > 0;
}

/**
 * Whether a full list's older rows wait for more than its source reads by itself once the list is short of them: the page holds no
 * row beyond those shown, and the node's listing has used up what the view may list or failed (D-111), or the blocks below have
 * been read as far as the views asked (D-110). The button that shows older rows then asks for it as well, as the one a short list
 * gives would: without it a press would show nothing new
 */
export function olderWaits(listed: number, shown: number, reach: HistoryState | undefined): boolean {
  if (listed > shown || !reach || reach.loading) return false;
  return reach.source === 'listing' ? reach.paused || reach.error !== undefined : reach.from > 0;
}

/**
 * Where the focus goes once older rows a reader asked for are drawn: on the row after the last one shown where one came (`next`);
 * nowhere yet while the list's source reads them (`wait`); on that last row where nothing came and no button stays below the list,
 * with nothing more to show or after a failure, whose button goes as the page tries again by itself, so that the focus does not go
 * with it (`last`); and nowhere where one stays (`stays`), which keeps the focus (`none`). It moves only from where the reader left
 * it (`free`: on the button, or nowhere, as Safari leaves it after a tap): one who went on elsewhere keeps their place
 */
export function olderFocus(o: { reading: boolean; next: boolean; stays: boolean; free: boolean }): 'next' | 'wait' | 'last' | 'none' {
  if (o.next) return o.free ? 'next' : 'none';
  if (o.reading) return 'wait';
  return o.stays || !o.free ? 'none' : 'last';
}

/**
 * Below a history list: the button that shows older rows, once the list is full and has older ones (`olderBeyond`), and once a
 * reader has asked for them, what `HistoryReach` says of the list, over the button that has the node read further where there is
 * one. The lists gave their newest rows alone (the operations page 60, an account's or a contract's 50, the wallet's activity 40),
 * and an older one could be reached from its block only. The row after the last one shown takes the focus as it comes, so that a
 * keyboard or a screen reader goes on where the list had ended (`olderFocus`); until then the button pressed, either of the two,
 * stays with its words, unavailable, and keeps the focus. What the list says is in a live region there from before the first
 * press, so that a screen reader reads it out as it changes: that older rows are being read, or that the read failed
 */
export function OlderRows({ of, listed, rows }: { of: HistoryKey; listed: number; rows: ReturnType<typeof useShownRows> }) {
  const sim = useChain();
  const t = useT();
  const h = t.ui.history;
  const rpc = sim.kind === 'rpc' ? sim : null;
  const slot = useRef<HTMLDivElement>(null);
  // The last row shown when a reader pressed the button, and its words, until the focus goes on from it or the request lapses
  const [asked, setAsked] = useState<{ last: Element | null; label: string } | null>(null);
  const reach = rpc?.ready ? rpc.history(of) : undefined;
  const beyond = olderBeyond(listed, rows.shown, reach);
  const says = rows.grown && reach ? reachWords(reach, listed >= rows.shown, h) : undefined;
  // The button: the list's older rows, or the node to read further where it stopped short or failed
  const label = beyond ? h.showOlder : says?.more;
  useEffect(() => {
    if (!asked) return;
    const { last } = asked;
    // The list is another one now, or holds no row to go on from
    if (!rows.grown || !last?.isConnected) {
      setAsked(null);
      return;
    }
    const row = last.nextElementSibling;
    const active = document.activeElement;
    const free = !active || active === document.body || active === slot.current?.querySelector('button');
    // Read now, not as drawn: the view above the list has the source read on once the list is short of the rows asked for
    const reading = !!rpc?.ready && rpc.history(of).loading;
    const retried = reach?.source === 'listing' && reach.error !== undefined;
    const step = olderFocus({ reading, next: row instanceof HTMLElement, stays: beyond || (label !== undefined && !retried), free });
    if (step === 'wait') return;
    setAsked(null);
    const target = step === 'next' ? row : step === 'last' ? last : null;
    if (!(target instanceof HTMLElement)) return;
    // The row as a whole, which a screen reader reads through: its first link may be a contract or an account in its middle. Tab
    // goes on from it to its links
    target.tabIndex = -1;
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
    target.focus({ preventScroll: true });
  });
  if (!beyond && !asked && !says) return null;
  const words = asked?.label ?? label;
  return (
    <div ref={slot} className="pagination older-rows">
      <p className="small muted" aria-live="polite">
        {says?.words}
      </p>
      {words !== undefined && (
        <Button
          size="sm"
          aria-disabled={asked ? true : undefined}
          onClick={() => {
            if (asked || label === undefined) return;
            const list = slot.current?.previousElementSibling;
            setAsked({ last: list?.matches('.table-wrap') ? list.querySelector('tbody tr:last-child') : null, label });
            if (!beyond) {
              rpc?.loadEarlier(of);
              return;
            }
            rows.more();
            if (olderWaits(listed, rows.shown, reach)) rpc?.loadEarlier(of);
          }}
        >
          {words}
        </Button>
      )}
    </div>
  );
}
