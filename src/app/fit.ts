/** The least share of its size a tab's label is set to before it is cut short */
export const LEAST_FIT = 0.7;

/**
 * A phone's bottom bar keeps each tab's label to one line, as a phone's own tab bar does: one longer than its tab (a Japanese katakana
 * word such as the one for "Explorer", 7 characters in a fifth of a phone's width) is set smaller until it fits, down to 70%, and cut
 * short only below that. The labels are fitted again whenever the bar's width or a label's own size changes: a reader's own wider
 * letter and word spacing, set after the page was drawn, changes the labels and not the bar, and had left "Operations" cut short at
 * 320 px, where 85% of its size fits. Returns what stops it
 */
export function fitLabels(nav: HTMLElement): () => void {
  const fit = () => {
    for (const el of nav.querySelectorAll<HTMLElement>('.bottomnav-label')) {
      el.style.removeProperty('--fit');
      const room = el.clientWidth;
      const need = el.scrollWidth;
      if (room > 0 && need > room) el.style.setProperty('--fit', String(Math.max(LEAST_FIT, Math.floor((room / need) * 100) / 100)));
    }
  };
  fit();
  // Fitting changes the labels' sizes, which the observer watches: done in the frame after its report rather than in it, it leaves the
  // observer a change to report in that frame, rather than one it would have to put off with an error
  let frame = 0;
  const watch = new ResizeObserver(() => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      fit();
    });
  });
  watch.observe(nav);
  for (const el of nav.querySelectorAll<HTMLElement>('.bottomnav-label')) watch.observe(el);
  return () => {
    watch.disconnect();
    cancelAnimationFrame(frame);
  };
}

/** The steps the top bar folds by (`data-fold`, drawn in pages.css) */
export const TOP_FOLDS = 3;

/**
 * The top bar keeps to its window: where its links and tools do not fit, as under a reader's own wider letter and word spacing (the
 * Spanish bar in the simulator ran 69 px past a window of 1 100 px, and 82 px past the right edge of the page's column in a wider one),
 * it folds as a narrower window does, a step at a time until they fit: first the contract playground's link goes, then the search box
 * folds into its icon and the network chip's data source, the language menu and the theme switch go, as from 861 to 1 099 px, and last
 * the wallet button keeps to its icon and the wallet's chip to its seal, as on a phone. The tools give way to the links
 * (`min-width: 0`), and what does not fit runs past their box. Fitted again whenever the bar's width or one of its parts' own size
 * changes. Returns what stops it
 */
export function fitTopBar(bar: HTMLElement): () => void {
  const tools = bar.querySelector<HTMLElement>('.topbar-tools');
  const parts = [bar.querySelector('.nav'), ...(tools?.children ?? [])].filter((el): el is Element => el !== null);
  const fit = () => {
    bar.removeAttribute('data-fold');
    for (let fold = 1; fold <= TOP_FOLDS && tools && tools.scrollWidth > tools.clientWidth; fold++) {
      bar.setAttribute('data-fold', String(fold));
    }
  };
  fit();
  // As the bottom bar's labels: in the frame after the observer's report, as folding changes the parts' sizes
  let frame = 0;
  const watch = new ResizeObserver(() => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      fit();
    });
  });
  watch.observe(bar);
  for (const el of parts) watch.observe(el);
  return () => {
    watch.disconnect();
    cancelAnimationFrame(frame);
  };
}
