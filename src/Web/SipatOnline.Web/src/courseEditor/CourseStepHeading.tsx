import type { ReactNode, Ref } from 'react';
import type { PlatformCourseStatus } from '../api';
import { statusLabels } from './courseFormat';

export default function CourseStepHeading({
  eyebrow,
  title,
  status,
  headingRef,
  children,
}: {
  eyebrow: string;
  title: string;
  status: PlatformCourseStatus;
  headingRef: Ref<HTMLHeadingElement>;
  children: ReactNode;
}) {
  return (
    <header className="ce-page-heading">
      <div className="ce-page-heading-top">
        <p className="ce-eyebrow">{eyebrow}</p>
        <span className={`ce-pill ce-pill-${status.toLowerCase()}`}>{statusLabels[status]}</span>
      </div>
      <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
      <p>{children}</p>
    </header>
  );
}
