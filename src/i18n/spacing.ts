import { cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';

/**
 * Chinese typesetting: one space between a Han character and a Latin letter, digit or `#` on either side, none between two Han characters.
 * Used in the Chinese messages to splice in a parameter that may be either Han characters or Latin text.
 */
export function latinGap(text: string, side: 'both' | 'before' = 'both'): string {
  const latinStart = /^[#A-Za-z0-9]/.test(text);
  const latinEnd = /[A-Za-z0-9)]$/.test(text);
  return `${latinStart ? ' ' : ''}${text}${side === 'both' && latinEnd ? ' ' : ''}`;
}

/**
 * A figure in the page's words and the word after it, most often the one it counts or measures ("64 hex characters", "the 12 blocks
 * after it", "6 confirmaciones", "~2 s", a count and its measure word in Chinese, Japanese or Korean), stay on one line: where a letter
 * follows a figure, the space between them becomes a no-break space, and the space before the figure still breaks. A figure is a run
 * of digits, with a decimal point or thousands separators; one after a letter, a digit, an underscore, a dot, a comma, a hyphen, a
 * slash, a number sign, a section sign or a colon ends a word or a name, or is part of one, and is left ("BIP340 signatures", "SHA-256
 * hash", "v0.2 rules", "#2,299 merged", "§6.9 says", the "30" of "12:30 UTC"), while one after a tilde or a minus sign (−) is joined
 * ("~2 s", "−30 s"). Matched with what comes before the figure rather than by looking behind, which fails to parse on iOS before 16.4
 */
const FIGURE_WORD = /(^|[^\p{L}\p{N}_.,\-/#§:])(\d+(?:[.,]\d+)*) (?=\p{L})/gu;

/**
 * Two figures with a mark between them, a fraction, a comparison or a range ("12 / 12 blocks", "fee rate 2 < 5 sat/vB", "#2,297 –
 * #2,299"), keep to one line too: the spaces on either side of the mark become no-break spaces. The marks: a slash, a less-than or
 * greater-than sign with or without a bar below, an equals sign, a plus or minus sign, a multiplication sign, an en dash and a tilde.
 * A range, a fraction or a sum in words is joined by hand in each language ("from 1 to 500", "2 of 6", "k + 1")
 */
const FIGURE_MARK = /(\d) ([/<>\u2264\u2265=+\u2212\u00d7\u2013~]) (?=#?\d)/g;

/** What both need, a figure and a space after it: most of the page's words have none, and are left after this quick search */
const FIGURE_SPACE = /\d /;

export function keepFigures(text: string): string {
  if (!FIGURE_SPACE.test(text)) return text;
  return text.replace(FIGURE_WORD, '$1$2\u00a0').replace(FIGURE_MARK, '$1\u00a0$2\u00a0');
}

/**
 * Elements whose text the page keeps as written, for a reader to copy or a form to send: code, a keyboard's keys, sample output,
 * preformatted text, a text area, an option
 */
const VERBATIM = new Set(['code', 'kbd', 'samp', 'pre', 'textarea', 'option']);

/**
 * An element a message makes for its words: a fragment, or an HTML element other than those. A component's (a link, an amount) is
 * one the page gives as a parameter, and the page's own
 */
function ownWords(el: ReactElement): boolean {
  return el.type === Fragment || (typeof el.type === 'string' && !VERBATIM.has(el.type));
}

/**
 * `keepFigures` over what a message makes: its text, or the text in its elements, where a figure given as a parameter is a node of its
 * own ("a block every ~{secs} s"), so the runs of text and figures beside each other are joined first, past anything drawn as nothing
 * (null, undefined, a boolean). What it leaves as it was is given back as it was, so that an element is copied only where its words
 * change
 */
function typesetNode(node: ReactNode): ReactNode {
  if (typeof node === 'string') return keepFigures(node);
  if (Array.isArray(node)) {
    const runs: ReactNode[] = [];
    for (const child of node as ReactNode[]) {
      if (child === null || child === undefined || typeof child === 'boolean') continue;
      const part = typeof child === 'number' || typeof child === 'bigint' ? String(child) : child;
      const last = runs[runs.length - 1];
      if (typeof part === 'string' && typeof last === 'string') runs[runs.length - 1] = last + part;
      else runs.push(part);
    }
    let changed = false;
    const set = runs.map((run) => {
      const made = typesetNode(run);
      changed ||= made !== run;
      return made;
    });
    return changed ? set : node;
  }
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined && ownWords(node)) {
    const children = typesetNode(node.props.children);
    if (children === node.props.children) return node;
    return Array.isArray(children) ? cloneElement(node, undefined, ...(children as ReactNode[])) : cloneElement(node, undefined, children);
  }
  return node;
}

/**
 * A language's messages set as `keepFigures` says, once as they load: every text, and what every function makes, text, elements, or a
 * list or a group of them, item by item, as a list or a group of messages is; a function keeps its number of parameters
 */
export function typeset<T>(messages: T): T {
  return typesetValue(messages) as T;
}

function typesetValue(v: unknown): unknown {
  if (typeof v === 'string') return keepFigures(v);
  if (typeof v === 'function') {
    const f = v as (...args: unknown[]) => unknown;
    const set = (...args: unknown[]) => typesetValue(f(...args));
    Object.defineProperty(set, 'length', { value: f.length });
    return set;
  }
  if (isValidElement(v)) return typesetNode(v);
  if (Array.isArray(v)) return v.map(typesetValue);
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typesetValue(x)]));
  return v;
}
