import { useEffect, useRef, useState } from 'react';
import type { LearningLessonProgress } from '@/api';

/**
 * The picture of a lesson's video, as the video library shows it: the one chosen for it (or the frame taken when it
 * was converted, or YouTube's own), else a frame a second into the video itself, else the training's cover.
 * The frame is asked for only when the card scrolls into view, so a long week does not open every video at once.
 */
export default function LessonPicture({ lesson, cover, className, eager = false }: {
  lesson: Pick<LearningLessonProgress, 'id' | 'thumbnailUrl' | 'isBonus' | 'provider'> | null | undefined;
  /** The training's cover: the last resort. */
  cover: string;
  className?: string;
  eager?: boolean;
}) {
  const thumbnail = lesson?.thumbnailUrl ?? null;
  // a frame is only possible for our own videos: an extra or a provider video has no file of ours
  const framePossible = !!lesson && !lesson.isBonus && !lesson.provider;
  const [step, setStep] = useState<'thumbnail' | 'frame' | 'cover'>(thumbnail ? 'thumbnail' : framePossible ? 'frame' : 'cover');
  const key = `${lesson?.id ?? ''}|${thumbnail ?? ''}`;
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    setShownKey(key);
    setStep(thumbnail ? 'thumbnail' : framePossible ? 'frame' : 'cover');
  }

  if (step === 'thumbnail' && thumbnail) {
    return <img alt="" className={className} decoding="async" loading={eager ? 'eager' : 'lazy'}
      onError={() => setStep(framePossible ? 'frame' : 'cover')} src={thumbnail} />;
  }
  if (step === 'frame' && lesson) {
    return <LessonFrame className={className} lessonId={lesson.id} onError={() => setStep('cover')} />;
  }
  return <img alt="" className={className} decoding="async" loading={eager ? 'eager' : 'lazy'} src={cover} />;
}

function LessonFrame({ lessonId, className, onError }: { lessonId: string; className?: string; onError: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return <video aria-hidden="true" className={`pointer-events-none block size-full object-cover ${className ?? ''}`} muted
    onError={onError} playsInline preload="metadata" ref={ref} tabIndex={-1}
    src={visible ? `/api/learning/lessons/${encodeURIComponent(lessonId)}/media#t=1` : undefined} />;
}
