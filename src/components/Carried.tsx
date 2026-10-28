import { carriedSpan, type CarriedBlock } from '../chain/views';
import { BlockRef } from './Refs';
import { Figures } from './Values';
import { useT } from '../i18n';

/** The blocks a payload carries (`carriedBlocks`): at most 5 are listed, with the middle elided when there are more */
export function CarriedRefs({ blocks }: { blocks: CarriedBlock[] }) {
  const shown = blocks.length > 6 ? [...blocks.slice(0, 2), null, ...blocks.slice(-3)] : blocks;
  return (
    <span className="row wrap gap-6">
      {shown.map((b, k) =>
        b ? (
          <BlockRef key={b.hash} height={b.height} hash={b.hash} />
        ) : (
          <span key={`gap-${k}`} className="muted">
            …
          </span>
        ),
      )}
    </span>
  );
}

/**
 * Block headers a payload carries: how many, named as the bodies below them are ("3 block headers"), from which block to which, and
 * the blocks. A bare "3 · #2,297 – #2,299" above "1 block body" left the figure to be guessed at, in every language but Spanish
 */
export function HeaderList({ count, blocks }: { count: number; blocks: CarriedBlock[] }) {
  const t = useT();
  const named = t.tx.diagram.envelope.headers(count);
  const span = carriedSpan(blocks);
  return (
    <span className="stack gap-4">
      <span className="small"><Figures text={span ? `${named} · ${span}` : named} /></span>
      <CarriedRefs blocks={blocks} />
    </span>
  );
}

/** Block bodies a payload carries (D-077): a settlement's own block and the backlogged blocks */
export function BodyList({ count, blocks }: { count: number; blocks: CarriedBlock[] }) {
  const t = useT();
  return (
    <span className="stack gap-4">
      <span className="small"><Figures text={t.tx.diagram.envelope.bodies(count)} /></span>
      <CarriedRefs blocks={blocks} />
    </span>
  );
}
