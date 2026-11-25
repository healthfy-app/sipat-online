import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  companyEditorLinks, getSipatCatalog, getTrainingEditor, listGameModules, setEditorScope,
  type GameModule, type PlatformLibraryVideo, type TrainingEditorData,
} from '@/api';
import CourseEditor from '@/courseEditor/CourseEditor';
import { getErrorMessage } from '@/courseEditor/courseFormat';
import LoadingState from '@/LoadingState';

/**
 * The video editor for a company's own training, opened by its administrator from the pencil on the training.
 * It is the editor the operation has in Conteúdo; what the company's plan does not allow shows locked.
 */
export default function TrainingEditorPage({ basePath }: { basePath: string }) {
  const navigate = useNavigate();
  const { sipatId = '' } = useParams();
  const [data, setData] = useState<TrainingEditorData | null>(null);
  const [library, setLibrary] = useState<PlatformLibraryVideo[]>([]);
  const [modules, setModules] = useState<GameModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (propagate = false) => {
    // the editor's own calls go to the company's routes while this page is open
    setEditorScope('company');
    setError('');
    try {
      const [training, catalog, games] = await Promise.all([getTrainingEditor(sipatId), getSipatCatalog(), listGameModules()]);
      setData(training);
      setLibrary(companyEditorLinks(catalog.videos));
      setModules(games);
    } catch (failure) {
      setError(getErrorMessage(failure));
      if (propagate) throw failure;
    } finally { setLoading(false); }
  }, [sipatId]);

  useEffect(() => {
    void load();
    return () => setEditorScope('platform');
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const locks = useMemo(() => data && {
    details: !data.access.editDetails,
    grid: !data.access.editGrid,
    activities: !data.access.editActivities,
    plan: data.access.plan,
  }, [data]);

  const back = () => navigate(`${basePath}/${sipatId}`);

  if (loading) return <LoadingState>Carregando o treinamento...</LoadingState>;
  if (!data || !locks) {
    return <div className="page-content"><div className="empty-state">
      <p>{error || 'Treinamento não encontrado.'}</p>
      <button className="button" onClick={() => navigate(basePath)} type="button">Voltar aos treinamentos</button>
    </div></div>;
  }

  return <div className="page-content course-workspace">
    {notice && <p className="success-message" role="status">{notice}</p>}
    <CourseEditor
      course={data.course}
      error={error}
      key={data.course.id}
      library={library}
      locks={locks}
      modules={modules}
      onBack={back}
      onChanged={async message => { await load(true); setNotice(message); }}
      onDuplicate={() => undefined}
      onError={setError}
      week={{ sipatTitle: data.sipatTitle, companyName: `Plano ${data.access.plan}` }}
    />
  </div>;
}
