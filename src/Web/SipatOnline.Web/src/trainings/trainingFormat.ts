const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const fullDateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });

/** "09/11 a 13/11"; one date when it starts and ends the same day; the years when they differ. */
export function periodLabel(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(new Date(endsAt).getTime() - 1);
  const format = start.getUTCFullYear() === end.getUTCFullYear() ? dateFormat : fullDateFormat;
  const [from, to] = [format.format(start), format.format(end)];
  return from === to ? from : `${from} a ${to}`;
}

/** "45 min", "1 h 20 min": how long the videos of the training run. */
export function runtime(milliseconds: number): string {
  const minutes = Math.max(1, Math.round(milliseconds / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes} min` : minutes % 60 === 0 ? `${hours} h` : `${hours} h ${minutes % 60} min`;
}
