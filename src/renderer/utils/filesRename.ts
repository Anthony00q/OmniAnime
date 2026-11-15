export interface FilesRenameItem {
  from: string;
  to: string;
  status: string;
}

export interface FilesRenamePreview {
  success: boolean;
  revision?: string;
  items?: FilesRenameItem[];
  summary?: {
    total?: number;
    toRename?: number;
    conflicts?: number;
    skippedNoNumber?: number;
  };
  error?: string;
}
