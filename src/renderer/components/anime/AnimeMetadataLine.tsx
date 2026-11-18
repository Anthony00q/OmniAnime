import { Fragment } from 'react';

export function AnimeMetadataLine({ values }: { values: Array<string | number | null | undefined> }) {
  const items = values.filter((value) => value !== null && value !== undefined && String(value).trim());
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground tabular-nums">
      {items.map((value, index) => (
        <Fragment key={index}>
          {index > 0 && (
            <span aria-hidden="true" className="text-border-strong">
              {' '}
              |{' '}
            </span>
          )}
          <span className="break-words">{value}</span>
        </Fragment>
      ))}
    </p>
  );
}
