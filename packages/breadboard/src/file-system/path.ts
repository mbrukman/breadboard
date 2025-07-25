/**
 * @license
 * Copyright 2024 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  FileSystemPath,
  FileSystemReadWritePath,
  Outcome,
} from "@breadboard-ai/types";
import { err, ok } from "@breadboard-ai/utils";

export { Path };

const PATH_SEPARATOR = "/";

type RootDirSpec = {
  name: string;
  writable: boolean;
  /**
   * Set to true when the files in this directory are persisted across the
   * lifetime of the FileSystem instance. In other words, they aren't part
   * of FileSystem's in-memory store.
   */
  persistent: boolean;
  /**
   * Set to true when the files in this directory come from mounted sources.
   * These files might not actually be files, but rather file-shaped objects
   * that the system supplies.
   */
  mounted: boolean;
};

const ROOT_DIRS: readonly RootDirSpec[] = [
  { name: "local", writable: true, persistent: true, mounted: false },
  { name: "mnt", writable: true, persistent: false, mounted: true },
  { name: "session", writable: true, persistent: false, mounted: false },
  { name: "run", writable: true, persistent: false, mounted: false },
  { name: "tmp", writable: true, persistent: false, mounted: false },
  { name: "env", writable: false, persistent: false, mounted: false },
  { name: "assets", writable: false, persistent: false, mounted: false },
] as const;

export function writablePathFromString(
  s: string
): Outcome<FileSystemReadWritePath> {
  const path = Path.create(s as FileSystemPath);
  if (!ok(path)) return path;
  if (!path.writable) {
    return err(`Path "${s}" is not writable`);
  }
  return s as FileSystemReadWritePath;
}

class Path {
  static roots = new Set(ROOT_DIRS.map((item) => item.name));
  static writableRoots = new Set(
    ROOT_DIRS.filter((item) => item.writable).map((item) => item.name)
  );
  static persistentRoots = new Set(
    ROOT_DIRS.filter((item) => item.persistent).map((item) => item.name)
  );
  static mountedRoots = new Set(
    ROOT_DIRS.filter((item) => item.mounted).map((item) => item.name)
  );

  readonly writable: boolean;
  readonly persistent: boolean;
  readonly mounted: boolean;

  constructor(
    public readonly root: string,
    public readonly path: string[],
    public readonly dir: boolean
  ) {
    this.writable = Path.writableRoots.has(this.root);
    this.persistent = Path.persistentRoots.has(this.root);
    this.mounted = Path.mountedRoots.has(this.root);
  }

  static createRoots(): Path[] {
    return ROOT_DIRS.map((item) => {
      return new Path(item.name, [], true);
    });
  }

  static create(path: FileSystemPath): Outcome<Path> {
    const components = path.split(PATH_SEPARATOR);
    const [leading, root, ...rest] = components;
    const isDir = rest.at(-1)?.length === 0;

    const validationResult = validate();
    if (!ok(validationResult)) {
      return validationResult;
    }
    return new Path(root, isDir ? rest.slice(0, -1) : rest, isDir);

    function validate(): Outcome<void> {
      if (leading.length !== 0)
        return {
          $error: `Invalid path "${path}": all paths must start with a slash`,
        };
      if (!Path.roots.has(root))
        return {
          $error: `Invalid path "${path}": unknown root directory`,
        };
      if (rest.length === 0)
        return {
          $error: `Invalid path "${path}": when pointing at a root directory, add a slash`,
        };
      for (const [i, fragment] of rest.entries()) {
        if (fragment.length === 0) {
          // Only last fragment can be empty (trailing slash)
          if (i !== rest.length - 1) {
            return {
              $error: `Invalid path "${path}": paths may not contain empty fragments`,
            };
          }
        }
      }
    }
  }
}
