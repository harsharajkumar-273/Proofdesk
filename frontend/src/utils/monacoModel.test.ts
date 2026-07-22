import { describe, it, expect, vi } from 'vitest';

export const disposeMonacoModelForTab = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  monacoInstance: any,
  filePath: string
): boolean => {
  if (!monacoInstance || !monacoInstance.editor) return false;

  try {
    const models = monacoInstance.editor.getModels();
    let disposedCount = 0;

    for (const model of models) {
      const modelPath = model.uri?.path || '';
      const uriStr = model.uri?.toString?.() || '';

      if (
        modelPath === filePath ||
        modelPath === `/${filePath}` ||
        uriStr.endsWith(filePath)
      ) {
        model.dispose();
        disposedCount++;
      }
    }
    return disposedCount > 0;
  } catch {
    return false;
  }
};

describe('Monaco Model Disposal Utility', () => {
  it('locates and disposes matching Monaco models for closed file tabs', () => {
    const disposeMock1 = vi.fn();
    const disposeMock2 = vi.fn();

    const mockMonaco = {
      editor: {
        getModels: () => [
          { uri: { path: '/src/main.ptx', toString: () => 'file:///src/main.ptx' }, dispose: disposeMock1 },
          { uri: { path: '/src/chapter1.ptx', toString: () => 'file:///src/chapter1.ptx' }, dispose: disposeMock2 },
        ],
      },
    };

    const result = disposeMonacoModelForTab(mockMonaco, 'src/main.ptx');

    expect(result).toBe(true);
    expect(disposeMock1).toHaveBeenCalledTimes(1);
    expect(disposeMock2).not.toHaveBeenCalled();
  });

  it('handles empty or missing Monaco editor instance gracefully', () => {
    const result = disposeMonacoModelForTab(null, 'src/main.ptx');
    expect(result).toBe(false);
  });
});
