/**
 * The colour around the edge of a loaded picture, as `rgb(r g b)`: what fills the space left around a piece that is
 * shown whole in a frame of another shape. Null when the picture cannot be read (another origin, no canvas).
 */
export function imageEdgeColor(image: HTMLImageElement): string | null {
  try {
    const size = 16;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);
    let red = 0, green = 0, blue = 0, count = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (x > 0 && x < size - 1 && y > 0 && y < size - 1) continue;
        const index = (y * size + x) * 4;
        if (data[index + 3] < 200) continue;
        red += data[index]; green += data[index + 1]; blue += data[index + 2]; count++;
      }
    }
    if (count === 0) return null;
    return `rgb(${Math.round(red / count)} ${Math.round(green / count)} ${Math.round(blue / count)})`;
  } catch {
    return null;
  }
}
