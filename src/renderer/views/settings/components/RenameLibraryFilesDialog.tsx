import { LibraryRenameWorkspace } from './LibraryRenameWorkspace';

interface RenameLibraryFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirs: string[];
  style: 'minimal' | 'descriptive';
}

export function RenameLibraryFilesDialog(props: RenameLibraryFilesDialogProps) {
  return <LibraryRenameWorkspace {...props} mode="files" />;
}
