import { useEffect, useMemo, useRef, useState } from 'react';
import {
  setPlatformCourseVideos,
  updatePlatformCourse,
  type GameModule,
  type PlatformCourse,
  type PlatformCourseStatus,
  type PlatformLibraryVideo,
} from '../api';
import CourseDialog from '../CourseDialog';
import CourseGamesSection from '../CourseGamesSection';
import AddVideoDialog from './AddVideoDialog';
import CourseConfigureStep, { type CourseSettingsValues } from './CourseConfigureStep';
import CourseEditorFrame, { type CourseEditorStep } from './CourseEditorFrame';
import CourseOutlinePanel from './CourseOutlinePanel';
import CoursePreviewCanvas, { type PreviewSize } from './CoursePreviewCanvas';
import CoursePropertiesPanel from './CoursePropertiesPanel';
import CoursePublishStep from './CoursePublishStep';
import { formatCourseOption, getCourseDescription, getCourseOption, getErrorMessage } from './courseFormat';
import { buildTrack } from './courseTrack';

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
  const [previewSize, setPreviewSize] = useState<PreviewSize>('phone');
  const [selectedKey, setSelectedKey] = useState<string | null>(
    () => (course.videos[0] ? `video-${course.videos[0].id}` : null),
  );
  const heading = useRef<HTMLHeadingElement>(null);

  const busy = isSaving || isMediaBusy;
  const dirty = !sameSettings(values, savedValues);
  const track = useMemo(() => buildTrack(course, modules), [course, modules]);
  const foundIndex = track.findIndex((item) => item.key === selectedKey);
  const selectedIndex = foundIndex >= 0 ? foundIndex : 0;
  const selectedItem = track[selectedIndex];
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

  async function changeVideos(videoIds: string[], message: string) {
    onError('');
    setIsMediaBusy(true);
    try {
      await setPlatformCourseVideos(course.id, videoIds);
      await onChanged(message);
      setActiveDialog(null);
    } catch (changeError) {
      onError(getErrorMessage(changeError));
    } finally {
      setIsMediaBusy(false);
    }
  }

  function moveVideo(index: number, offset: -1 | 1) {
    const ids = [...linkedIds];
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    void changeVideos(ids, 'A ordem dos vídeos foi atualizada.');
  }

  function openDialog(dialog: 'video' | 'games') {
    onError('');
    setActiveDialog(dialog);
  }

  return (
    <CourseEditorFrame busy={busy} dirty={dirty} onBack={onBack} onSave={() => void saveCourse()} onStep={setStep} step={step}>
      {error && !activeDialog && <p className="form-error ce-error" role="alert">{error}</p>}

      {step === 'edit' && (
        <div className="ce-workspace">
          <CourseOutlinePanel
            busy={busy}
            course={course}
            headingRef={heading}
            onAddVideo={() => openDialog('video')}
            onDuplicate={() => {
              if (!dirty || window.confirm('Há alterações não salvas. Deseja duplicar a versão salva?')) onDuplicate();
            }}
            onManageActivities={() => openDialog('games')}
            onMoveVideo={moveVideo}
            onRemoveVideo={(videoId) => void changeVideos(
              linkedIds.filter((id) => id !== videoId),
              'O vídeo foi removido do curso; continua na biblioteca.',
            )}
            onSelect={setSelectedKey}
            selectedKey={selectedItem?.key ?? null}
            status={status}
            title={values.title}
            track={track}
          />
          <CoursePreviewCanvas
            onSelectIndex={(index) => setSelectedKey(track[index]?.key ?? null)}
            onSize={setPreviewSize}
            selectedIndex={selectedIndex}
            size={previewSize}
            track={track}
          />
          <CoursePropertiesPanel
            busy={busy}
            gamificationEnabled={values.gamificationEnabled}
            item={selectedItem}
            onManageActivities={() => openDialog('games')}
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

      {activeDialog === 'video' && (
        <AddVideoDialog
          availableVideos={availableVideos}
          busy={isMediaBusy}
          courseId={course.id}
          error={error}
          onBusyChange={setIsMediaBusy}
          onClose={() => setActiveDialog(null)}
          onError={onError}
          onLink={(id) => void changeVideos([...linkedIds, id], 'O vídeo foi vinculado ao curso.')}
          onUploaded={async (video) => {
            await onChanged(`O vídeo "${video.title}" foi enviado e vinculado ao curso.`);
            setSelectedKey(`video-${video.id}`);
            setActiveDialog(null);
          }}
        />
      )}

      {activeDialog === 'games' && (
        <CourseDialog onClose={() => setActiveDialog(null)} title="Atividades e perguntas" wide>
          {error && <p className="form-error" role="alert">{error}</p>}
          <CourseGamesSection course={course} modules={modules} onChanged={onChanged} onError={onError} />
        </CourseDialog>
      )}
    </CourseEditorFrame>
  );
}
