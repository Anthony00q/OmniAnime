import * as path from 'path';
import { isPathSafeForDestructiveOperation } from '../../utils/security/pathSecurity';
import type { ThumbnailService } from './ThumbnailService';

interface FolderLease {
  paths: string[];
}

export class LibraryMutationService {
  private readonly leases = new Set<FolderLease>();

  constructor(
    private readonly options: {
      getAllowedBaseDirs: () => string[];
      queueOwnsFolder: (folderPath: string) => boolean;
      thumbnailService: Pick<ThumbnailService, 'withFileMutation'>;
    },
  ) {}

  reserveDownload(folderPath: string): () => void {
    return this.reserve([folderPath]);
  }

  async run<T>(folderPaths: string[], mutate: () => T | Promise<T>): Promise<T> {
    const release = this.reserve(folderPaths);
    const check = () => {
      for (const folderPath of folderPaths) {
        this.validate(folderPath);
        if (this.options.queueOwnsFolder(this.key(folderPath))) {
          throw new Error(
            'No se pueden modificar archivos de una carpeta con una descarga pendiente, activa o pausada.',
          );
        }
      }
    };
    const paused = (index: number): Promise<T> =>
      index < folderPaths.length
        ? this.options.thumbnailService.withFileMutation(folderPaths[index], true, () => paused(index + 1))
        : Promise.resolve().then(() => {
            check();
            return mutate();
          });
    try {
      check();
      return await paused(0);
    } finally {
      release();
    }
  }

  private reserve(folderPaths: string[]): () => void {
    if (!folderPaths.length) throw new Error('No se indicó una carpeta de la librería.');
    folderPaths.forEach((folderPath) => this.validate(folderPath));
    const paths = folderPaths.map((folderPath) => this.key(folderPath));
    if (
      [...this.leases].some((lease) =>
        lease.paths.some((a) =>
          paths.some((b) => a === b || a.startsWith(`${b}${path.sep}`) || b.startsWith(`${a}${path.sep}`)),
        ),
      )
    ) {
      throw new Error('Hay otra operación en curso sobre esta carpeta. Espera a que termine.');
    }
    const lease = { paths };
    this.leases.add(lease);
    return () => {
      this.leases.delete(lease);
    };
  }

  private validate(folderPath: string): void {
    if (
      typeof folderPath !== 'string' ||
      !path.isAbsolute(folderPath) ||
      !isPathSafeForDestructiveOperation(folderPath, this.options.getAllowedBaseDirs(), false)
    ) {
      throw new Error('La carpeta está fuera de la librería configurada o no es segura.');
    }
  }

  private key(folderPath: string): string {
    const value = path.resolve(folderPath);
    return process.platform === 'win32' ? value.toLowerCase() : value;
  }
}
