import { saveFile } from '@/lib/saveFile';

export function downloadCsv(filename: string, content: string): void {
  saveFile(new Blob([content], { type: 'text/csv;charset=utf-8' }), filename);
}
