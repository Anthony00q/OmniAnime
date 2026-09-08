import * as fs from 'fs';
import * as path from 'path';

function isPathInside(basePath: string, targetPath: string, allowBase: boolean): boolean {
  const base = path.resolve(basePath);
  const target = path.resolve(targetPath);
  // Windows is case-insensitive: normalize to lower for relative checks
  const isWin = process.platform === 'win32';
  const baseNorm = isWin ? base.toLowerCase() : base;
  const targetNorm = isWin ? target.toLowerCase() : target;
  // Use normalized paths for relative on Windows to avoid case mismatch (C:\DOWNLOADS vs C:\Downloads)
  const relative = path.relative(baseNorm, targetNorm);

  if (relative === '') return allowBase;
  if (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`)) return false;

  // handle junctions/symlinks via nearest existing
  let existingPath = target;
  while (!fs.existsSync(existingPath)) {
    const parent = path.dirname(existingPath);
    if (parent === existingPath) break;
    existingPath = parent;
  }

  try {
    const realBase = fs.realpathSync.native(base);
    const realExisting = fs.realpathSync.native(existingPath);
    const realRelative = path.relative(
      isWin ? realBase.toLowerCase() : realBase,
      isWin ? realExisting.toLowerCase() : realExisting,
    );
    return !path.isAbsolute(realRelative) && realRelative !== '..' && !realRelative.startsWith(`..${path.sep}`);
  } catch {
    // Si realpath falla (ruta aún no existe), caer al check relativo ya validado
    return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
  }
}

export function isPathWithinAnyDirectory(targetPath: string, baseDirectories: string[], allowBase = true): boolean {
  const target = String(targetPath || '').trim();
  if (!target) return false;

  return baseDirectories.some((baseDirectory) => {
    const base = String(baseDirectory || '').trim();
    return base && isPathInside(base, target, allowBase);
  });
}

export function isSafeChildName(name: string): boolean {
  const value = String(name || '').trim();
  return Boolean(value) && value !== '.' && value !== '..' && path.basename(value) === value && !/[\\/]/.test(value);
}

export function isPathSafeForDestructiveOperation(
  targetPath: string,
  baseDirectories: string[],
  allowBase = false,
): boolean {
  const target = String(targetPath || '').trim();
  if (!target) return false;
  if (!isPathWithinAnyDirectory(target, baseDirectories, allowBase)) return false;
  try {
    const resolved = path.resolve(target);
    // If target exists, check symlink/junction via lstat + realpath
    if (fs.existsSync(resolved)) {
      try {
        const lstat = fs.lstatSync(resolved);
        if (lstat.isSymbolicLink()) return false;
      } catch {
        return false;
      }
      try {
        const real = fs.realpathSync.native(resolved);
        // Junction/symlink will have different realpath; deny any indirection for destructives
        if (path.resolve(real).toLowerCase() !== resolved.toLowerCase()) return false;
      } catch {}
    } else {
      // Non-existent target (e.g., rename destination): check parent
      const parent = path.dirname(resolved);
      if (fs.existsSync(parent)) {
        try {
          const lstatParent = fs.lstatSync(parent);
          if (lstatParent.isSymbolicLink()) return false;
        } catch {
          return false;
        }
        try {
          const realParent = fs.realpathSync.native(parent);
          if (path.resolve(realParent).toLowerCase() !== parent.toLowerCase()) return false;
        } catch {}
      }
    }
  } catch {
    return false;
  }
  return true;
}
