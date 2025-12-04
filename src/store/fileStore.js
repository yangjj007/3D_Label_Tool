import { defineStore } from "pinia";

const createFileId = file => `${file.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useFileStore = defineStore("fileStore", {
  state: () => ({
    files: [],
    selectedFileId: null
  }),
  actions: {
    addOrUpdateFile(file) {
      const existingIndex = this.files.findIndex(item => item.id === file.id);
      if (existingIndex > -1) {
        const updated = { ...this.files[existingIndex], ...file };
        this.files.splice(existingIndex, 1, updated);
      } else {
        this.files.unshift(file);
      }
    },
    removeFile(fileId) {
      this.files = this.files.filter(item => item.id !== fileId);
      if (this.selectedFileId === fileId) {
        this.selectedFileId = null;
      }
    },
    setSelectedFile(fileId) {
      this.selectedFileId = fileId;
    },
    setFileStatus(fileId, status) {
      const file = this.files.find(item => item.id === fileId);
      if (file) {
        file.status = status;
      }
    },
    setFileProgress(fileId, progress) {
      const file = this.files.find(item => item.id === fileId);
      if (file) {
        file.progress = progress;
      }
    },
    setFiles(files) {
      this.files = [...files];
    },
    addUploadedFile(fileData) {
      const record = {
        id: fileData.id || createFileId(fileData),
        name: fileData.name,
        size: fileData.size,
        status: fileData.status || "pending",
        progress: fileData.progress || 0,
        type: fileData.type,
        labels: fileData.labels || [],
        folder: fileData.folder,
        updatedAt: fileData.updatedAt || new Date().toISOString()
      };
      this.addOrUpdateFile(record);
      return record.id;
    }
  }
});

