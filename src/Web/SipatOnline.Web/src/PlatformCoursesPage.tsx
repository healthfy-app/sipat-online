import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  duplicatePlatformCourse,
  listGameModules,
  listPlatformCourses,
  listPlatformLibraryVideos,
  type GameModule,
  type PlatformCourse,
  type PlatformLibraryVideo,
} from './api';
import LoadingState from './LoadingState';
import CourseCatalog from './courseCatalog/CourseCatalog';
import CourseEditor from './courseEditor/CourseEditor';
import { getErrorMessage } from './courseEditor/courseFormat';
import './PlatformCourses.css';

/**
 * Página de conteúdo da plataforma: mostra o catálogo (cursos, vídeos e jogos)
 * ou, quando a rota traz um curso, o editor desse curso.
 */
export default function PlatformCoursesPage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [courses, setCourses] = useState<PlatformCourse[]>([]);
  const [library, setLibrary] = useState<PlatformLibraryVideo[]>([]);
  const [modules, setModules] = useState<GameModule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const openCourse = useCallback(
    (id: string | null) => navigate(id ? `/platform/courses/${id}/edit` : '/platform/courses'),
    [navigate],
  );

  const refresh = useCallback(async (propagateError = false) => {
    setError('');
    setIsLoading(true);
    try {
      const [courseList, libraryList, moduleList] = await Promise.all([
        listPlatformCourses(),
        listPlatformLibraryVideos(),
        listGameModules(),
      ]);
      setCourses(courseList);
      setLibrary(libraryList);
      setModules(moduleList);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
      if (propagateError) throw loadError;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function duplicate(course: PlatformCourse) {
    setError('');
    setNotice('');
    setIsDuplicating(true);
    try {
      const copy = await duplicatePlatformCourse(course.id);
      await refresh();
      openCourse(copy.id);
      setNotice(`O curso "${copy.title}" foi criado como rascunho, usando os mesmos vídeos.`);
    } catch (duplicateError) {
      setError(getErrorMessage(duplicateError));
    } finally {
      setIsDuplicating(false);
    }
  }

  const selectedCourse = courseId ? courses.find((course) => course.id === courseId) ?? null : null;

  return (
    <div className="page-content course-workspace">
      {notice && <p className="success-message" role="status">{notice}</p>}

      {courseId ? (
        selectedCourse ? (
          <CourseEditor
            course={selectedCourse}
            error={error}
            key={selectedCourse.id}
            library={library}
            modules={modules}
            onBack={() => { openCourse(null); setError(''); setNotice(''); }}
            onChanged={async (message) => { await refresh(true); setNotice(message); }}
            onDuplicate={() => void duplicate(selectedCourse)}
            onError={setError}
          />
        ) : isLoading ? (
          <LoadingState>Carregando curso...</LoadingState>
        ) : (
          <div className="empty-state">
            <p>{error ? 'Não foi possível carregar o curso.' : 'Curso não encontrado.'}</p>
            <button className="button" onClick={() => openCourse(null)} type="button">Voltar aos cursos</button>
          </div>
        )
      ) : (
        <CourseCatalog
          busy={isDuplicating}
          courses={courses}
          error={error}
          isLoading={isLoading}
          library={library}
          modules={modules}
          onCreated={async (course) => {
            setError('');
            setCourses((current) => [course, ...current.filter((item) => item.id !== course.id)]);
            openCourse(course.id);
            setNotice(`O curso "${course.title}" foi criado no catálogo global.`);
          }}
          onDuplicate={(course) => void duplicate(course)}
          onError={setError}
          onModulesChanged={async (message) => { await refresh(); setNotice(message); }}
          onOpen={(course) => { setError(''); setNotice(''); openCourse(course.id); }}
          onRetry={() => void refresh()}
          onVideoUploaded={async (video) => {
            await refresh();
            setNotice(`O vídeo "${video.title}" foi enviado ao catálogo.`);
          }}
        />
      )}
    </div>
  );
}
