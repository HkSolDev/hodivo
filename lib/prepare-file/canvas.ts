export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');
  return { canvas, context };
}

export function paintImage(bitmap: ImageBitmap, width: number, height: number) {
  const { canvas, context } = makeCanvas(width, height);
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  const scale = Math.min(width / bitmap.width, height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.drawImage(
    bitmap,
    (width - drawWidth) / 2,
    (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  return { canvas, context };
}

export function jpegBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob?.type === 'image/jpeg') resolve(blob);
        else reject(new Error('Could not encode a JPEG.'));
      },
      'image/jpeg',
      quality,
    );
  });
}
