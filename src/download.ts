/** Save bytes (or text) as a file through the browser's download, named `filename`. */
export function downloadFile(data: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Revoked a moment later: some browsers start reading the file after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
