import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSetAtom } from 'jotai';
import { selectedLibraryFolderAtom } from '@/renderer/store/atoms';
import type { FilesRenamePreview } from '@/renderer/utils/filesRename';
import { publishRenamedLibraryFolder } from './library';
import { getAniListBannerQuery, ANILIST_BANNER_STALE_MS, type AniListBannerRequest } from './anilist';
import { isIpcFailError, unwrap } from './unwrap';

export type LibraryRenameCommand =
  | { kind: 'files'; path: string; style: 'minimal' | 'descriptive'; revision: string }
  | { kind: 'folders'; path: string; newName: string };

export interface LibraryRenameOutcome {
  path: string;
  kind: 'files' | 'folders';
  state: 'done' | 'partial' | 'failed' | 'uncertain' | 'not-started';
  renamed?: number;
  failed?: number;
  conflicts?: number;
  skipped?: number;
  finalName?: string;
  error?: string;
}

export function useLibraryRenameOperations() {
  const client = useQueryClient();
  const setSelectedFolder = useSetAtom(selectedLibraryFolderAtom);
  const isMutating = useIsMutating({ mutationKey: ['library-files'] }) > 0;
  const batch = useMutation({
    mutationKey: ['library-files', 'batch-rename'],
    retry: false,
    mutationFn: async ({
      commands,
      onProgress,
    }: {
      commands: readonly LibraryRenameCommand[];
      onProgress: (outcome: LibraryRenameOutcome, done: number) => void;
    }) => {
      await Promise.all(
        ['library', 'episodes', 'preview-rename', 'preview-reorder'].map((key) =>
          client.cancelQueries({ queryKey: [key] }),
        ),
      );
      const outcomes: LibraryRenameOutcome[] = [];
      let interrupted = false;
      for (const command of commands) {
        if (interrupted) {
          const outcome: LibraryRenameOutcome = {
            path: command.path,
            kind: command.kind,
            state: 'not-started',
            error: 'El lote se detuvo porque no se pudo confirmar la operación anterior.',
          };
          outcomes.push(outcome);
          onProgress(outcome, outcomes.length);
          continue;
        }
        let outcome: LibraryRenameOutcome;
        try {
          if (command.kind === 'files') {
            const data = unwrap(
              await window.api.invoke('rename-anime-files', {
                animePath: command.path,
                style: command.style,
                expectedRevision: command.revision,
              }),
              { toast: false },
            );
            if (
              !data?.success ||
              !Number.isSafeInteger(data.renamed) ||
              data.renamed < 0 ||
              [data.failed, data.skippedConflicts, data.skippedNoNumber].some(
                (count) => count != null && (!Number.isSafeInteger(count) || count < 0),
              )
            )
              throw new Error('No se pudo confirmar el resultado. Revisa la carpeta de nuevo.');
            if (Array.isArray(data.episodes)) client.setQueryData(['episodes', command.path], data.episodes);
            const partial = data.failed > 0 || data.skippedConflicts > 0 || data.skippedNoNumber > 0;
            outcome = {
              path: command.path,
              kind: command.kind,
              state: partial ? 'partial' : 'done',
              renamed: data.renamed,
              failed: data.failed || 0,
              conflicts: data.skippedConflicts || 0,
              skipped: data.skippedNoNumber || 0,
            };
          } else {
            const data = unwrap(
              await window.api.invoke('rename-folder', {
                oldPath: command.path,
                newName: command.newName,
              }),
              { toast: false },
            );
            if (typeof data?.newPath !== 'string' || !data.newPath || typeof data.name !== 'string' || !data.name)
              throw new Error('No se pudo confirmar el resultado. Revisa la carpeta de nuevo.');
            publishRenamedLibraryFolder(client, command.path, data);
            setSelectedFolder((current) => (current === command.path ? data.newPath : current));
            outcome = { path: command.path, kind: command.kind, state: 'done', renamed: 1, finalName: data.name };
          }
        } catch (error) {
          interrupted = !isIpcFailError(error) || error.code === 'IPC_TIMEOUT' || error.code === 'IPC_HANDLER_ERROR';
          outcome = {
            path: command.path,
            kind: command.kind,
            state: interrupted ? 'uncertain' : 'failed',
            error: interrupted
              ? 'No se pudo confirmar el resultado. La operación puede seguir en curso. Comprueba la carpeta antes de preparar otra revisión.'
              : isIpcFailError(error)
                ? error.message
                : 'No se pudo confirmar el cambio. Revisa la carpeta de nuevo.',
          };
        }
        outcomes.push(outcome);
        onProgress(outcome, outcomes.length);
      }
      return outcomes;
    },
    onSettled: async () => {
      await Promise.all(
        ['library', 'episodes', 'preview-rename', 'preview-reorder'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  return {
    isMutating,
    batch,
    inspectFiles: (path: string, style: 'minimal' | 'descriptive') =>
      client.fetchQuery({
        queryKey: ['preview-rename', path, style],
        queryFn: async () =>
          unwrap<FilesRenamePreview>(
            await window.api.invoke('preview-rename-anime-files', {
              animePath: path,
              style,
            }),
            { toast: false },
          ),
        staleTime: 0,
        gcTime: 30_000,
        retry: false,
      }),
    resolveTitles: (request: AniListBannerRequest, force = false) =>
      client.fetchQuery({
        ...getAniListBannerQuery(request),
        staleTime: force ? 0 : ANILIST_BANNER_STALE_MS,
        retry: false,
      }),
  };
}
