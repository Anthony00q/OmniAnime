import type { FolderNameSource } from '@/utils/downloads/folderNaming';
import { LibraryRenameWorkspace } from './LibraryRenameWorkspace';

interface RenameFoldersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirs: string[];
  source: FolderNameSource;
}

export function RenameFoldersDialog(props: RenameFoldersDialogProps) {
  return <LibraryRenameWorkspace {...props} mode="folders" />;
}
