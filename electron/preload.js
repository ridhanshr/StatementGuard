const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // File operations
  selectFile: () => ipcRenderer.invoke('select-file'),
  saveFile: (defaultName) => ipcRenderer.invoke('save-file', defaultName),
  writeCsv: (filePath, csvContent) => ipcRenderer.invoke('write-csv', filePath, csvContent),
  
  // Validation
  runValidation: (params) => ipcRenderer.invoke('run-validation', params),
  
  // Progress listener
  onProgress: (callback) => {
    ipcRenderer.on('validation-progress', (event, data) => callback(data));
  },
  
  // Data listener (realtime incremental results)
  onData: (callback) => {
    ipcRenderer.on('validation-data', (event, data) => callback(data));
  },
  
  // Remove listeners
  removeProgressListener: () => {
    ipcRenderer.removeAllListeners('validation-progress');
  },
  removeDataListener: () => {
    ipcRenderer.removeAllListeners('validation-data');
  }
});
