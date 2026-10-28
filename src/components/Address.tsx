import { addressGroups } from '../lib/format';

/**
 * The full address shown in groups, with the first and last `EDGE_CHARS` characters after the prefix in bold: the other party
 * verifies them (against address poisoning). They are marked by character, not by group: marking whole groups showed 6
 * characters at the end of a Taproot address, whose last group is 2 long, while the page asked for 8.
 */
export function GroupedAddress({ address, size = 4, className = '' }: { address: string; size?: number; className?: string }) {
  const { prefix, groups } = addressGroups(address, size);
  return (
    <div className={`addr-groups mono${className ? ` ${className}` : ''}`} aria-label={address}>
      {prefix && <span className="addr-hrp">{prefix}</span>}
      {groups.map(([head, plain, tail], i) => (
        <span key={i}>
          {head && <span className="addr-edge">{head}</span>}
          {plain}
          {tail && <span className="addr-edge">{tail}</span>}
        </span>
      ))}
    </div>
  );
}
