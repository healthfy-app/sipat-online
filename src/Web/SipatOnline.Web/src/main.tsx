import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './Motion.css';
import './LoginPage.css';
import './AdminDesign.css';
import './ui/tailwind.css';
import './Shell.css';
import { installErrorReporting } from './telemetry';
import { rememberLinkedTraining } from './trainings/trainingLink';

installErrorReporting();
// a session that starts on the link of a training remembers it through the login
rememberLinkedTraining();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
