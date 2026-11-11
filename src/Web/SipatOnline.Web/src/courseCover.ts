export function getCourseCover(title: string): string {
  const normalized = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const subject = /alimentacao|nutricao/.test(normalized) ? 'nutrition'
    : /ergonomia|atividade fisica/.test(normalized) ? 'ergonomics'
    : /seguranca|comportamento seguro|prevencao/.test(normalized) ? 'safety'
    : /habitos|qualidade de vida/.test(normalized) ? 'workplace'
    : /higiene mental|saude|sono/.test(normalized) ? 'wellbeing'
    : /lideranca/.test(normalized) ? 'leadership'
    : 'workplace';
  return `/course-covers/${subject}.jpg`;
}
