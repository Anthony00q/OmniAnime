import { useMemo } from 'react';
import {
  groupReleaseSections,
  inlineText,
  isVersionLine,
  parseReleaseNotes,
  type ReleaseNotesBlock,
  type ReleaseNotesHeadingRole,
  type ReleaseNotesInline,
} from '@/renderer/utils/releaseNotes';

const VERSION_VOICE = 'text-base font-semibold tabular-nums text-foreground';
const ZONE_VOICE = 'text-[11px] font-semibold uppercase tracking-[0.09em] text-text-tertiary';
const LONG_HEADING_VOICE = 'text-sm font-semibold text-foreground';
const LINK_CLASS =
  'text-primary underline underline-offset-2 hover:underline decoration-primary/50 hover:decoration-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50';

// El modal no navega: los enlaces abren en el navegador del sistema, con la
// política de URLs del changelog.
function openInSystemBrowser(href: string) {
  void window.api.invoke('open-external-url', href, { policy: 'changelog' });
}

function Inline({ nodes }: { nodes: ReleaseNotesInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        const href = node.href;
        const body = node.code ? (
          <code className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-xs text-foreground">{node.text}</code>
        ) : (
          node.text
        );
        const styled = node.bold ? <strong className="font-semibold text-foreground">{body}</strong> : body;
        if (href) {
          return (
            <a
              key={index}
              href={href}
              onClick={(event) => {
                event.preventDefault();
                openInSystemBrowser(href);
              }}
              className={LINK_CLASS}
            >
              {styled}
            </a>
          );
        }
        return <span key={index}>{styled}</span>;
      })}
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

// Tres voces de encabezado según su rol: versión, zona del changelog y lo
// demás. La voz no depende de la longitud del texto.
function SectionHeading({ nodes, role }: { nodes: ReleaseNotesInline[]; role: ReleaseNotesHeadingRole }) {
  const voice = role === 'version' ? VERSION_VOICE : role === 'zone' ? ZONE_VOICE : LONG_HEADING_VOICE;
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
          {section.heading && <SectionHeading nodes={section.heading} role={section.headingRole ?? 'free'} />}
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
