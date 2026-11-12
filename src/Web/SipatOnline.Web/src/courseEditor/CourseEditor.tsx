import { useEffect, useMemo, useRef, useState } from 'react';
import {
  setPlatformCourseModules,
  setPlatformCourseStructure,
  type CourseLessonDraft,
  updatePlatformCourse,
  type GameModule,
  type PlatformCourse,
  type PlatformCourseStatus,
  type PlatformLibraryVideo,
} from '../api';
import { Dialog } from '@/components/ui/dialog';
import CourseGamesSection from '../CourseGamesSection';
import AddActivityDialog from './AddActivityDialog';
import AddVideoDialog from './AddVideoDialog';
import CourseConfigureStep, { type CourseSettingsValues } from './CourseConfigureStep';
import CourseEditorFrame, { type CourseEditorStep } from './CourseEditorFrame';
import CourseOutlinePanel, { type OutlineActions } from './CourseOutlinePanel';
import CoursePreviewCanvas, { type PreviewSize } from './CoursePreviewCanvas';
import CoursePropertiesPanel from './CoursePropertiesPanel';
import CoursePublishStep from './CoursePublishStep';
import { formatCourseOption, getCourseDescription, getCourseOption, getErrorMessage } from './courseFormat';
import { buildTrack, groupTrackByLesson } from './courseTrack';
import {
  addLesson, addVideoToLesson, describeLesson, moveLesson, moveVideoInStructure,
  removeLesson, removeVideo, renameLesson, retitleVideo, toDrafts,
} from './courseStructure';

function settingsFrom(course: PlatformCourse): CourseSettingsValues {
  return {
    title: course.title,
    description: getCourseDescription(course.description),
    gamificationEnabled: course.gamificationEnabled,
    gameType: course.gameType,
  };
}

const sameSettings = (a: CourseSettingsValues, b: CourseSettingsValues) =>
  a.title === b.title && a.description === b.description
  && a.gamificationEnabled === b.gamificationEnabled && a.gameType === b.gameType;

export default function CourseEditor({
  course,
  error,
  library,
  modules,
  onBack,
  onChanged,
  onDuplicate,
  onError,
}: {
  course: PlatformCourse;
  error: string;
  library: PlatformLibraryVideo[];
  modules: GameModule[];
  onBack: () => void;
  onChanged: (message: string) => Promise<void>;
  onDuplicate: () => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState(() => settingsFrom(course));
  const [savedValues, setSavedValues] = useState(() => settingsFrom(course));
  const [status, setStatus] = useState<PlatformCourseStatus>(course.status);
  const [step, setStep] = useState<CourseEditorStep>('edit');
  const [isSaving, setIsSaving] = useState(false);
  const [isMediaBusy, setIsMediaBusy] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'video' | 'games' | null>(null);
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [activityPosition, setActivityPosition] = useState<number | null>(null);
  const [previewSize, setPreviewSize] = useState<PreviewSize>('phone');
  const [selectedKey, setSelectedKey] = useState<string | null>(
    () => (course.videos[0] ? `video-${course.videos[0].id}` : null),
  );
  const heading = useRef<HTMLHeadingElement>(null);

  const busy = isSaving || isMediaBusy;
  const dirty = !sameSettings(values, savedValues);
  const track = useMemo(() => buildTrack(course, modules), [course, modules]);
  const groups = useMemo(() => groupTrackByLesson(course, track), [course, track]);
  const selectedLessonIndex = groups.findIndex((group) => selectedKey === `lesson-${group.id}`);
  const selectedLesson = selectedLessonIndex >= 0 ? groups[selectedLessonIndex] : undefined;
  const foundIndex = selectedLesson
    ? track.findIndex((item) => selectedLesson.items.includes(item))
    : track.findIndex((item) => item.key === selectedKey);
  const selectedIndex = foundIndex >= 0 ? foundIndex : 0;
  const selectedItem = selectedLesson ? undefined : track[selectedIndex];
  const linkedIds = course.videos.map((video) => video.id);
  const availableVideos = library.filter((item) => !linkedIds.includes(item.video.id));

  useEffect(() => { heading.current?.focus(); }, []);

  async function saveCourse(nextStatus: PlatformCourseStatus = status) {
    onError('');
    if (!values.title.trim()) {
      onError('Informe o nome do curso antes de salvar.');
      return;
    }
    setIsSaving(true);
    try {
      const saved = await updatePlatformCourse(course.id, {
        title: values.title.trim(),
        description: formatCourseOption(getCourseOption(course.description), values.description.trim()),
        status: nextStatus,
        gamificationEnabled: values.gamificationEnabled,
        gameType: values.gameType,
      });
      const next = settingsFrom(saved);
      setValues(next);
      setSavedValues(next);
      setStatus(saved.status);
      await onChanged('As alterações do curso foram salvas.');
    } catch (saveError) {
      onError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function changeStructure(drafts: CourseLessonDraft[], message: string) {
    onError('');
    setIsMediaBusy(true);
    try {
      await setPlatformCourseStructure(course.id, drafts);
      await onChanged(message);
      setActiveDialog(null);
    } catch (changeError) {
      onError(getErrorMessage(changeError));
    } finally {
      setIsMediaBusy(false);
    }
  }

  const drafts = () => toDrafts(course);

  const outlineActions: OutlineActions = {
    onSelect: setSelectedKey,
    onTitle: (title) => setValues((current) => ({ ...current, title })),
    onAddLesson: () => void changeStructure(addLesson(drafts()), 'A aula foi criada.'),
    onAddVideo: (lessonId) => {
      setAddTarget(lessonId);
      openDialog('video');
    },
    onRenameLesson: (lessonId, title) => void changeStructure(renameLesson(drafts(), lessonId, title), 'O nome da aula foi atualizado.'),
    onMoveLesson: (lessonId, offset) => void changeStructure(moveLesson(drafts(), lessonId, offset), 'A ordem das aulas foi atualizada.'),
    onRemoveLesson: (lessonId) => {
      const lesson = groups.find((group) => group.id === lessonId);
      const videos = lesson?.items.filter((item) => item.kind === 'video').length ?? 0;
      if (videos > 0 && !window.confirm(`Remover a aula "${lesson?.title}" e tirar ${videos} vídeo(s) do curso? Eles continuam na biblioteca.`)) return;
      void changeStructure(removeLesson(drafts(), lessonId), 'A aula foi removida; os vídeos continuam na biblioteca.');
    },
    onRenameVideo: (videoId, title) => void changeStructure(retitleVideo(drafts(), videoId, title), 'O título do vídeo foi atualizado neste curso.'),
    onMoveVideo: (videoId, offset) => void changeStructure(moveVideoInStructure(drafts(), videoId, offset), 'A ordem dos vídeos foi atualizada.'),
    onRemoveVideo: (videoId) => void changeStructure(removeVideo(drafts(), videoId), 'O vídeo foi removido do curso; continua na biblioteca.'),
    onManageActivities: () => openDialog('games'),
    onAddActivity: (afterVideoCount) => {
      onError('');
      setActivityPosition(afterVideoCount);
    },
    onDuplicate: () => {
      if (!dirty || window.confirm('Há alterações não salvas. Deseja duplicar a versão salva?')) onDuplicate();
    },
  };

  async function addActivity(moduleId: string) {
    if (activityPosition === null) return;
    onError('');
    setIsMediaBusy(true);
    try {
      await setPlatformCourseModules(course.id, [...course.modules, { moduleId, afterVideoCount: activityPosition }]);
      await onChanged('A atividade foi adicionada à trilha.');
      setActivityPosition(null);
    } catch (activityError) {
      onError(getErrorMessage(activityError));
    } finally {
      setIsMediaBusy(false);
    }
  }

  function linkVideo(videoId: string) {
    const current = drafts();
    const base = current.length > 0 ? current : addLesson([]);
    const target = base.some((lesson) => lesson.id === addTarget) ? addTarget : base[base.length - 1].id;
    void changeStructure(addVideoToLesson(base, target, videoId), 'O vídeo foi vinculado ao curso.');
  }

  function openDialog(dialog: 'video' | 'games') {
    onError('');
    setActiveDialog(dialog);
  }

  return (
    <CourseEditorFrame busy={busy} dirty={dirty} onBack={onBack} onSave={() => void saveCourse()} onStep={setStep} step={step}>
      {error && !activeDialog && (
        <p className="fixed left-1/2 top-[4.75rem] z-[25] m-0 max-w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 rounded-md bg-destructive-soft px-4 py-2.5 text-sm font-medium text-destructive shadow-overlay" role="alert">{error}</p>
      )}

      {step === 'edit' && (
        <div className="grid min-h-0 grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)_minmax(16rem,20rem)] max-[1180px]:min-h-auto max-[1180px]:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)] max-[860px]:grid-cols-1">
          <CourseOutlinePanel
            actions={outlineActions}
            busy={busy}
            course={course}
            groups={groups}
            headingRef={heading}
            selectedKey={selectedLesson ? `lesson-${selectedLesson.id}` : selectedItem?.key ?? null}
            status={status}
            title={values.title}
          />
          <CoursePreviewCanvas
            onSelectIndex={(index) => setSelectedKey(track[index]?.key ?? null)}
            onSize={setPreviewSize}
            selectedIndex={selectedIndex}
            size={previewSize}
            track={track}
          />
          <CoursePropertiesPanel
            actions={{
              onAddVideo: outlineActions.onAddVideo,
              onDescribeLesson: (lessonId, description) => void changeStructure(describeLesson(drafts(), lessonId, description), 'A descrição da aula foi atualizada.'),
              onManageActivities: () => openDialog('games'),
              onRemoveVideo: outlineActions.onRemoveVideo,
              onRenameLesson: outlineActions.onRenameLesson,
              onRenameVideo: (videoId, title) => void changeStructure(retitleVideo(drafts(), videoId, title), 'O título do vídeo foi atualizado neste curso.'),
            }}
            busy={busy}
            gamificationEnabled={values.gamificationEnabled}
            item={selectedItem}
            lesson={selectedLesson}
            lessonIndex={selectedLessonIndex}
            position={selectedIndex}
            total={track.length}
          />
        </div>
      )}

      {step === 'configure' && (
        <CourseConfigureStep
          busy={busy}
          course={course}
          headingRef={heading}
          isSaving={isSaving}
          onBusyChange={setIsMediaBusy}
          onChange={(patch) => setValues((current) => ({ ...current, ...patch }))}
          onChanged={onChanged}
          onError={onError}
          onSubmit={() => void saveCourse()}
          status={status}
          values={values}
        />
      )}

      {step === 'publish' && (
        <CoursePublishStep
          busy={busy}
          course={course}
          description={values.description}
          gamificationEnabled={values.gamificationEnabled}
          headingRef={heading}
          onPublish={() => void saveCourse('Published')}
          onReviewSettings={() => setStep('configure')}
          onUnpublish={() => {
            if (window.confirm('Voltar este curso para rascunho? Ele deixará de aparecer no catálogo.')) void saveCourse('Draft');
          }}
          status={status}
          title={values.title}
        />
      )}

      {activityPosition !== null && (
        <AddActivityDialog
          busy={isMediaBusy}
          error={error}
          modules={modules}
          onClose={() => setActivityPosition(null)}
          onPick={(moduleId) => void addActivity(moduleId)}
          position={activityPosition}
        />
      )}

      {activeDialog === 'video' && (
        <AddVideoDialog
          availableVideos={availableVideos}
          busy={isMediaBusy}
          courseId={course.id}
          error={error}
          onBusyChange={setIsMediaBusy}
          onClose={() => setActiveDialog(null)}
          onError={onError}
          onLink={linkVideo}
          onUploaded={async (video) => {
            await onChanged(`O vídeo "${video.title}" foi enviado e vinculado ao curso.`);
            setSelectedKey(`video-${video.id}`);
            setActiveDialog(null);
          }}
        />
      )}

      {activeDialog === 'games' && (
        <Dialog onClose={() => setActiveDialog(null)} size="lg" title="Atividades e perguntas">
          {error && <p className="m-0 mb-4 rounded-md bg-destructive-soft px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
          <CourseGamesSection course={course} modules={modules} onChanged={onChanged} onError={onError} />
        </Dialog>
      )}
    </CourseEditorFrame>
  );
}
