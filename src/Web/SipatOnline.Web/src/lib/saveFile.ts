/** How long the file's link stays valid: Edge and Chrome may read it only after "Salvar como" or their scan. */
const LINK_LIFETIME_MS = 60_000;

/**
 * Hands a file made in the browser to the viewer. The link lives inside an open dialog when there is one (a modal
 * keeps the page behind it out of reach) and is revoked only a minute later, never right after the click.
 */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  const host = document.querySelector('[role="dialog"]') ?? document.body;
  host.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), LINK_LIFETIME_MS);
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
