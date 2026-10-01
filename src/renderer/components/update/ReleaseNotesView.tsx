import { useMemo } from 'react';
import {
  groupReleaseSections,
  inlineText,
  isVersionLine,
  parseReleaseNotes,
  type ReleaseNotesBlock,
  type ReleaseNotesInline,
} from '@/renderer/utils/releaseNotes';

const VERSION_VOICE = 'text-base font-semibold tabular-nums text-foreground';
const ZONE_VOICE = 'text-[11px] font-semibold uppercase tracking-[0.09em] text-text-tertiary';
const LONG_HEADING_VOICE = 'text-sm font-semibold text-foreground';

function Inline({ nodes }: { nodes: ReleaseNotesInline[] }) {
  return (
    <>
      {nodes.map((node, index) =>
        node.bold ? (
          <strong key={index} className="font-semibold text-foreground">
            {node.text}
          </strong>
        ) : (
          <span key={index}>{node.text}</span>
        ),
      )}
    </>
  );
}

function Block({ block }: { block: ReleaseNotesBlock }) {
  if (block.kind === 'list') {
    return (
      <ul className="list-disc space-y-2 pl-5 marker:text-text-tertiary">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>
            <Inline nodes={item} />
          </li>
        ))}
      </ul>
    );
  }
  const text = inlineText(block.content).trim();
  return (
    <p className={isVersionLine(text) ? VERSION_VOICE : undefined}>
      <Inline nodes={block.content} />
    </p>
  );
}

// Tres voces para encabezados: versión, zona del changelog (corta) y lo
// largo que no encaja en ninguna.
function SectionHeading({ nodes }: { nodes: ReleaseNotesInline[] }) {
  const text = inlineText(nodes);
  const voice = isVersionLine(text)
    ? VERSION_VOICE
    : text.length <= 24 && text.split(/\s+/).length <= 3
      ? ZONE_VOICE
      : LONG_HEADING_VOICE;
  return (
    <div className="mb-3 border-b border-border/40 pb-1.5">
      <p className={voice}>
        <Inline nodes={nodes} />
      </p>
    </div>
  );
}

export function ReleaseNotesView({ notes }: { notes: string }) {
  const sections = useMemo(() => groupReleaseSections(parseReleaseNotes(notes)), [notes]);
  if (sections.length === 0) {
    return <p>{notes}</p>;
  }
  return (
    <div className="space-y-6">
      {sections.map((section, index) => (
        <section key={index}>
          {section.heading && <SectionHeading nodes={section.heading} />}
          {section.blocks.length > 0 && (
            <div className={section.heading ? 'mt-3 space-y-2' : 'space-y-2'}>
              {section.blocks.map((block, blockIndex) => (
                <Block key={blockIndex} block={block} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
