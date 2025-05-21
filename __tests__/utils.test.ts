import mock from 'mock-fs';
import { getDirectoryStructure } from '../src/utils';
import path from 'path';

// Mock the 'fs/promises' module
jest.mock('fs/promises');

// Import the mocked fsPromises AFTER jest.mock has been called
import * as fsPromises from 'fs/promises';

// Helper to get a reference to the actual fs/promises for fallback
const actualFsPromises = jest.requireActual('fs/promises');

// Helper to create absolute paths for mock-fs
const base = path.resolve('project');

describe('getDirectoryStructure', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console.warn to check for error logging
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // Reset all mocks before each test, including fsPromises
    jest.clearAllMocks();
    // Configure the mock for fsPromises.readdir to use actualFsPromises.readdir by default for most tests
    // Specific tests can override this.
    (fsPromises.readdir as jest.Mock).mockImplementation(
      actualFsPromises.readdir
    );
  });

  afterEach(() => {
    mock.restore(); // Restore the real file system
    consoleWarnSpy.mockRestore();
  });

  it('should return a basic directory structure', async () => {
    mock({
      [base]: {
        src: {
          components: {},
          services: {},
        },
        docs: {},
        public: {},
      },
    });
    const result = await getDirectoryStructure(base);
    expect(result).toEqual(
      expect.arrayContaining([
        'src',
        'src/components',
        'src/services',
        'docs',
        'public',
      ])
    );
    expect(result.length).toBe(5);
  });

  it('should ignore standard excluded directories (node_modules, .git, dist, build)', async () => {
    mock({
      [base]: {
        src: {},
        node_modules: { some_package: {} },
        '.git': { HEAD: '' },
        dist: { 'main.js': '' },
        build: { output: {} },
        packages: {
          core: {},
          node_modules: {}, // nested node_modules
        },
      },
    });
    const result = await getDirectoryStructure(base);
    expect(result).toEqual(
      expect.arrayContaining(['src', 'packages', 'packages/core'])
    );
    expect(result).not.toContain(expect.stringMatching(/node_modules/));
    expect(result).not.toContain(expect.stringMatching(/\.git/));
    expect(result).not.toContain(expect.stringMatching(/dist/));
    expect(result).not.toContain(expect.stringMatching(/build/));
    expect(result.length).toBe(3);
  });

  it('should ignore hidden directories (names starting with a dot)', async () => {
    mock({
      [base]: {
        src: {},
        '.vscode': { settings: '' },
        '.secrets': { 'key.pem': '' },
        app: {
          '.config': {},
          main: {},
        },
      },
    });
    const result = await getDirectoryStructure(base);
    expect(result).toEqual(expect.arrayContaining(['src', 'app', 'app/main']));
    expect(result).not.toContain(expect.stringMatching(/\.vscode/));
    expect(result).not.toContain(expect.stringMatching(/\.secrets/));
    expect(result).not.toContain(expect.stringMatching(/\.config/)); // This was correct
    expect(result.length).toBe(3);
  });

  it('should ensure all paths are relative to baseDir and use forward slashes', async () => {
    mock({
      [path.join(base, 'parent', 'child')]: {},
      [path.join(base, 'another', 'deep', 'dir')]: {},
    });
    const result = await getDirectoryStructure(base);
    expect(result).toEqual(
      expect.arrayContaining([
        'parent',
        'parent/child',
        'another',
        'another/deep',
        'another/deep/dir',
      ])
    );
    result.forEach((p) => {
      expect(p).not.toContain('\\');
      expect(path.isAbsolute(p)).toBe(false);
    });
  });

  it('should include empty directories if not otherwise ignored', async () => {
    mock({
      [base]: {
        empty_dir1: {},
        src: {
          empty_too: {},
          not_empty: { 'file.txt': 'content' },
        },
      },
    });
    const result = await getDirectoryStructure(base);
    expect(result).toEqual(
      expect.arrayContaining([
        'empty_dir1',
        'src',
        'src/empty_too',
        'src/not_empty',
      ])
    );
    expect(result.length).toBe(4);
  });

  it('should correctly list deeply nested structures', async () => {
    mock({
      [base]: {
        a: {
          b: {
            c: {
              d: {},
            },
            e: {},
          },
          f: {},
        },
        g: {},
      },
    });
    const result = await getDirectoryStructure(base);
    expect(result).toEqual(
      expect.arrayContaining([
        'a',
        'a/b',
        'a/b/c',
        'a/b/c/d',
        'a/b/e',
        'a/f',
        'g',
      ])
    );
    expect(result.length).toBe(7);
  });

  it('should return an empty array when baseDir has no subdirectories (only files)', async () => {
    mock({
      [base]: {
        'file.txt': 'content',
      },
    });
    const result = await getDirectoryStructure(base);
    expect(result).toEqual([]);
  });

  it('should return an empty array when baseDir itself is empty', async () => {
    mock({
      [base]: {},
    });
    const result = await getDirectoryStructure(base);
    expect(result).toEqual([]);
  });

  it('should log a warning and skip problematic directories (generic error)', async () => {
    mock({
      [base]: {
        good_dir: {},
        problem_dir: { 'child_of_problem.txt': 'content' }, // Added a child to ensure it's not listed
        another_dir: {
          child: {},
        },
      },
    });

    (fsPromises.readdir as jest.Mock).mockImplementation(
      async (p: fsPromises.PathLike, options) => {
        if (p === path.join(base, 'problem_dir')) {
          throw new Error('Test error reading problem_dir');
        }
        return actualFsPromises.readdir(p, options);
      }
    );

    const result = await getDirectoryStructure(base);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Warning: Could not read directory ${path.join(base, 'problem_dir')}. Error: Test error reading problem_dir. Skipping.`
      )
    );
    // problem_dir itself will be listed because its parent (base) is readable.
    // However, its children (e.g., problem_dir/child_of_problem.txt) will not be.
    expect(result).toEqual(
      expect.arrayContaining([
        'good_dir',
        'problem_dir',
        'another_dir',
        'another_dir/child',
      ])
    );
    expect(result).not.toContain('problem_dir/child_of_problem.txt'); // Verify child is not listed
    expect(result.length).toBe(4);
  });

  it('should handle permission errors (EACCES) when reading a directory', async () => {
    mock({
      [base]: {
        accessible_dir: {},
        restricted_dir: { 'child_of_restricted.txt': 'content' }, // Added a child
        another_accessible_dir: {
          sub_dir: {},
        },
      },
    });

    (fsPromises.readdir as jest.Mock).mockImplementation(
      async (p: fsPromises.PathLike, options) => {
        if (p === path.join(base, 'restricted_dir')) {
          const error = new Error(
            'Simulated EACCES error'
          ) as NodeJS.ErrnoException;
          error.code = 'EACCES';
          throw error;
        }
        return actualFsPromises.readdir(p, options);
      }
    );

    const result = await getDirectoryStructure(base);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `Warning: Could not read directory ${path.join(base, 'restricted_dir')}. Error: Simulated EACCES error. Skipping.`
      )
    );
    // restricted_dir itself will be listed. Its children will not.
    expect(result).toEqual(
      expect.arrayContaining([
        'accessible_dir',
        'restricted_dir',
        'another_accessible_dir',
        'another_accessible_dir/sub_dir',
      ])
    );
    expect(result).not.toContain('restricted_dir/child_of_restricted.txt');
    expect(result.length).toBe(4);
  });
});
