/** Picks the training the follow-up screen shows. Hidden when the company has fewer than two trainings. */
export function TrainingSelect({ trainings, value, onChange }: {
  trainings: readonly { id: string; title: string }[]; value: string | null; onChange: (id: string | null) => void;
}) {
  if (trainings.length < 2) return null;
  return <label className="grid gap-1 text-sm font-medium">
    Treinamento
    <select className="h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm sm:w-72"
      onChange={event => onChange(event.target.value || null)} value={value ?? ''}>
      <option value="">Todos os treinamentos</option>
      {trainings.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
    </select>
  </label>;
}
