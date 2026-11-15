import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PlaygroundApp from './PlaygroundApp';

createRoot(document.getElementById('root')!).render(<StrictMode><PlaygroundApp /></StrictMode>);
