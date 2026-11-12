export default function CourseStartOptions({
  onReuse,
  onCreate,
}: {
  onReuse: () => void;
  onCreate: () => void;
}) {
  return (
    <section aria-label="Como deseja começar?" className="course-start-options">
      <button className="course-start-option" onClick={onReuse} type="button">
        <StartIcon kind="folder" />
        <strong>Tenho um <span>treinamento já existente</span></strong>
        <p>Envie os vídeos que você já tem para a biblioteca e monte o curso com eles.</p>
        <span aria-hidden="true" className="course-start-arrow">→</span>
      </button>
      <button className="course-start-option course-start-option-new" onClick={onCreate} type="button">
        <StartIcon kind="pencil" />
        <strong>Quero <span>criar um treinamento</span></strong>
        <p>Comece um curso com uma capa, um título e uma breve descrição.</p>
        <span aria-hidden="true" className="course-start-arrow">→</span>
      </button>
    </section>
  );
}

/* ilustrações nas cores da marca SIPAT: verde e amarelo de sinalização */
function StartIcon({ kind }: { kind: 'folder' | 'pencil' }) {
  return (
    <svg aria-hidden="true" className="course-start-icon" fill="none" viewBox="0 0 64 64">
      {kind === 'folder' ? (
        <>
          <path d="M8 16a5 5 0 0 1 5-5h15l6 7h18a5 5 0 0 1 5 5v27H8Z" fill="#cce3d6" />
          <path d="M17 23h29v22H17Z" fill="#fff" />
          <path d="M23 29h17M23 35h13" stroke="#9cc7b0" strokeLinecap="round" strokeWidth="3" />
          <path d="m8 50 9-21h43l-9 21Z" fill="#14694b" />
        </>
      ) : (
        <>
          <path d="m12 48 3-13L43 7a4 4 0 0 1 6 0l6 6a4 4 0 0 1 0 6L27 47Z" fill="#ffd166" />
          <path d="m15 35 12 12-15 1Z" fill="#f3e3c3" />
          <path d="m39 11 12 12" stroke="#14694b" strokeWidth="4" />
          <path d="M7 56c10-8 12 6 22-1s12 0 23-5" stroke="#9cc7b0" strokeLinecap="round" strokeWidth="3" />
        </>
      )}
    </svg>
  );
}
