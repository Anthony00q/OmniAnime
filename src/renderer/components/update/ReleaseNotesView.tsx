import { useMemo } from 'react';
import {
  groupReleaseSections,
  parseReleaseNotes,
  type ReleaseNotesBlock,
  type ReleaseNotesInline,
} from '../../utils/releaseNotes';

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
      <ul className="space-y-1.5 list-disc pl-5 marker:text-muted-foreground">
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex}>
            <Inline nodes={item} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <p>
      <Inline nodes={block.content} />
    </p>
  );
}

export function ReleaseNotesView({ notes }: { notes: string }) {
  const sections = useMemo(() => groupReleaseSections(parseReleaseNotes(notes)), [notes]);
  if (sections.length === 0) {
    return <p>{notes}</p>;
  }
  return (
    <div className="space-y-4">
      {sections.map((section, index) => (
        <section key={index} className="space-y-1.5">
          {section.heading && (
            <p className="font-semibold text-foreground">
              <Inline nodes={section.heading} />
            </p>
          )}
          {section.blocks.map((block, blockIndex) => (
            <Block key={blockIndex} block={block} />
          ))}
        </section>
      ))}
    </div>
  );
}
