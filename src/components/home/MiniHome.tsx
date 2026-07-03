const ACCENT = 'rgb(var(--accent-r), var(--accent-g), var(--accent-b))';

/**
 * MiniHome — a photo-free miniature of the site, shown inside the WalkIn frame.
 * A tiny impression of the real homepage built from its own type + layout and
 * REAL collection data: masthead row, the "Visual Archive" line, a ruled index
 * of every collection (Nº · name · frames), a caption. No images at all — the
 * frame holds the SITE, not a photograph. Scales up crisply with the frame's
 * transform as you walk in.
 *
 * Sizes are in cqw (container-query width units) so the whole mock scales with
 * the frame at any viewport; the frame declares `container-type: size`.
 */
export default function MiniHome({
  collections,
  frames,
}: {
  collections: { name: string; frames: number }[];
  frames: number;
}) {
  const rows = collections.slice(0, 7);
  return (
    <div
      className="absolute inset-0 bg-[#282c20] text-[#F4F4ED] flex flex-col overflow-hidden"
      style={{ containerType: 'size', padding: '7cqw 7cqw 6cqw', gap: '4cqw' }}
      aria-hidden="true"
    >
      {/* Masthead row */}
      <div
        className="flex items-center justify-between border-b"
        style={{ borderColor: 'rgba(244,244,237,0.14)', paddingBottom: '3cqw' }}
      >
        <span className="font-serif uppercase" style={{ fontSize: '3.4cqw', letterSpacing: '0.18em' }}>
          Ryan&nbsp;Xu
        </span>
        <span className="font-ui uppercase" style={{ fontSize: '2cqw', letterSpacing: '0.28em', color: 'rgba(244,244,237,0.5)' }}>
          Map&nbsp;&nbsp;·&nbsp;&nbsp;About
        </span>
      </div>

      {/* Heading */}
      <div style={{ marginTop: '1cqw' }}>
        <span className="font-ui uppercase block" style={{ fontSize: '2cqw', letterSpacing: '0.4em', color: ACCENT, marginBottom: '2cqw' }}>
          Nº {String(collections.length).padStart(2, '0')} — Visual Archive
        </span>
        <span className="font-serif uppercase block" style={{ fontSize: '6.4cqw', lineHeight: 0.95, letterSpacing: '-0.01em' }}>
          Selected Works
        </span>
      </div>

      {/* Index of collections — the archive as text, no photos */}
      <ul className="flex-1 flex flex-col justify-center" style={{ marginTop: '1cqw' }}>
        {rows.map((c, i) => (
          <li
            key={i}
            className="flex items-baseline justify-between border-b"
            style={{ borderColor: 'rgba(244,244,237,0.09)', padding: '2.4cqw 0' }}
          >
            <span className="flex items-baseline" style={{ gap: '3cqw' }}>
              <span className="font-ui tabular-nums" style={{ fontSize: '2cqw', letterSpacing: '0.2em', color: 'rgba(244,244,237,0.4)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-serif uppercase" style={{ fontSize: '3.6cqw', letterSpacing: '-0.01em' }}>
                {c.name}
              </span>
            </span>
            <span className="font-ui tabular-nums" style={{ fontSize: '2cqw', letterSpacing: '0.2em', color: 'rgba(244,244,237,0.4)' }}>
              {String(c.frames).padStart(2, '0')}
            </span>
          </li>
        ))}
      </ul>

      {/* Caption */}
      <div
        className="flex items-center justify-between border-t"
        style={{ borderColor: 'rgba(244,244,237,0.14)', paddingTop: '3cqw' }}
      >
        <span className="font-ui uppercase" style={{ fontSize: '2cqw', letterSpacing: '0.26em', color: 'rgba(244,244,237,0.42)' }}>
          A record of light &amp; place
        </span>
        <span className="font-ui tabular-nums" style={{ fontSize: '2cqw', letterSpacing: '0.2em', color: 'rgba(244,244,237,0.42)' }}>
          {frames} frames
        </span>
      </div>
    </div>
  );
}
