import { useCallback, useEffect, useState } from 'react';
import { createCourseCategory, listCourseCategories, type CourseCategory } from '@/api';

/** The categories of the library, loaded once and kept in step with what the screen creates. */
export function useCourseCategories() {
  const [categories, setCategories] = useState<CourseCategory[]>([]);

  const reload = useCallback(async () => {
    try {
      setCategories(await listCourseCategories());
    } catch {
      // a screen without categories still works: subjects just show without one
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const create = useCallback(async (name: string) => {
    const category = await createCourseCategory(name);
    setCategories((known) => known.some((item) => item.id === category.id) ? known : [...known, category]);
    return category;
  }, []);

  return { categories, reload, create };
}
