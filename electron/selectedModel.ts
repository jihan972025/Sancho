/** Shared selected model state across Electron main process modules. */
let _selectedModel = ''

export function setSelectedModel(model: string): void {
  _selectedModel = model
}

export function getSelectedModel(): string {
  return _selectedModel
}
