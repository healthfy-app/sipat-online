export interface Sample { id: string; title: string; src: string }

/** Public videos the development provider already uses; nothing is stored in the repo. */
export const samples: Sample[] = [
  { id: 'mdn-flower', title: 'Flor (MDN, curto)', src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4' },
  {
    id: 'wikimedia-ergonomics',
    title: 'Ergonomia (Wikimedia)',
    src: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Practical_Demonstrations_of_Ergonomic_Principles.webm',
  },
];

export const fileSampleId = 'file';
export const fileSampleTitle = 'Arquivo do computador';
