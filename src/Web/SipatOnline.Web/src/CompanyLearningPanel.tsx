import { useState } from 'react';
import {
  applyProgramToCompany, listPlatformCourses, listSipatPrograms, requestCompanyLearning, distributeCompanyCourse,
  type PlatformCourse, type CompanyLearningCatalog, type SipatProgram,
} from './api';
import CourseDialog from './CourseDialog';
import { describeApplication } from './sipatBuilder/ApplyDialog';

export default function CompanyLearningPanel({ companyId }: { companyId: string }) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<CompanyLearningCatalog | null>(null);
  const [courses, setCourses] = useState<PlatformCourse[]>([]);
  const [sipatId, setSipatId] = useState('');
  const [courseId, setCourseId] = useState('');
  const [programs, setPrograms] = useState<SipatProgram[]>([]);
  const [programId, setProgramId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    setOpen(true); setBusy(true); setError('');
    try {
      const [learning, available, programList] = await Promise.all([requestCompanyLearning(companyId), listPlatformCourses(), listSipatPrograms()]);
      setPrograms(programList);
      setCatalog(learning); setCourses(available.filter(course => course.status === 'Published' && course.videos.length > 0));
      setSipatId(current => current || learning.events[0]?.id || '');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível carregar os cursos.'); }
    finally { setBusy(false); }
  }
  const available = courses.filter(course => !catalog?.courses.some(item => item.sourceCourseId === course.id && item.sipatEventId === sipatId));
  async function applyProgram() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await applyProgramToCompany(companyId, sipatId, programId);
      setCatalog(await requestCompanyLearning(companyId));
      setProgramId('');
      setNotice(describeApplication(result));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível aplicar o programa.'); }
    finally { setBusy(false); }
  }
  async function associate() {
    setBusy(true); setError(''); setNotice('');
    try {
      await distributeCompanyCourse(companyId, sipatId, courseId);
      setCatalog(await requestCompanyLearning(companyId));
      setCourseId(''); setNotice('Curso associado à SIPAT e aos participantes ativos. A versão publicada foi preservada.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível associar o curso.'); }
    finally { setBusy(false); }
  }
  return <>
    <button className="button button-secondary" onClick={() => void load()} type="button">Cursos da empresa</button>
    {open && <CourseDialog busy={busy} onClose={() => setOpen(false)} title="Cursos da empresa" wide>
      {busy && <LoadingState className="loading-state-compact">Processando cursos...</LoadingState>}
      {error && <div role="alert" className="form-error"><p>{error}</p><button className="button button-quiet" onClick={() => void load()} type="button">Recarregar</button></div>}
      {notice && <p role="status">{notice}</p>}
      {catalog && <form className="event-form event-form-single" onSubmit={event => { event.preventDefault(); void associate(); }}>
        <div className="field"><label htmlFor="distribution-sipat">SIPAT publicada</label>
          <select disabled={busy} id="distribution-sipat" onChange={event => { setSipatId(event.target.value); setCourseId(''); }} required value={sipatId}>
            <option value="">Selecione</option>{catalog.events.map(event => <option key={event.id} value={event.id}>{event.title}</option>)}
          </select></div>
        <div className="field"><label htmlFor="distribution-course">Curso do catálogo</label>
          <select disabled={busy || !sipatId} id="distribution-course" onChange={event => setCourseId(event.target.value)} required value={courseId}>
            <option value="">Selecione</option>{available.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}
          </select></div>
        {programs.length > 0 && <fieldset className="field" style={{ border: '1px solid var(--line)', borderRadius: '0.5rem', padding: '0.75rem' }}>
          <legend>Aplicar um programa inteiro</legend>
          <label htmlFor="distribution-program">Programa com dias</label>
          <select disabled={busy || !sipatId} id="distribution-program" onChange={event => setProgramId(event.target.value)} value={programId}>
            <option value="">Selecione</option>{programs.map(program => <option key={program.id} value={program.id}>{program.title}</option>)}
          </select>
          <p className="field-hint">Associa todos os cursos do programa a esta SIPAT e organiza o participante por dia. Todos os cursos precisam estar publicados e ter vídeos.</p>
          <button className="button button-primary" disabled={busy || !sipatId || !programId} onClick={() => void applyProgram()} type="button">Aplicar programa</button>
        </fieldset>}
        <p className="field-hint">Cria uma versão para esta empresa e atribui aos participantes ativos. Alterações futuras no catálogo não mudam esta versão automaticamente.</p>
        <button className="button button-primary" disabled={busy || !sipatId || !courseId} type="submit">Associar curso aos participantes</button>
        {!catalog.events.length && <p>Cadastre e publique uma SIPAT no portal da empresa antes de associar cursos.</p>}
        <h3>Cursos já associados</h3>
        <ul>{catalog.courses.filter(course => course.sipatEventId === sipatId).map(course => <li key={course.trackId}>{course.title}</li>)}</ul>
      </form>}
    </CourseDialog>}
  </>;
}
import LoadingState from './LoadingState';
