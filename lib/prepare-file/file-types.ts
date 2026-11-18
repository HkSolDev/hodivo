export const isPdf = (file: File) =>
  /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
export const isHeic = (file: File) =>
  /\.hei[cf]$/i.test(file.name) || /^image\/hei[cf]$/.test(file.type);

export function validateFiles(files: File[]) {
  if (files.some((file) => isPdf(file)) && files.length > 1) {
    return 'Choose one PDF or a set of images.';
  }
  if (
    files.some(
      (file) =>
        !isPdf(file) &&
        !isHeic(file) &&
        !/\.(jpe?g|png|webp)$/i.test(file.name) &&
        !/^image\/(jpeg|png|webp)$/.test(file.type),
    )
  ) {
    return 'Choose JPG, PNG, WebP, HEIC, HEIF or PDF files.';
  }
  const bytes = files.reduce((sum, file) => sum + file.size, 0);
  if (bytes > 50_000_000 || files.some((file) => file.size === 0)) {
    return 'Choose nonempty files totaling no more than 50 MB.';
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}
