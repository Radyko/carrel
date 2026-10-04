import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyRememberedLook } from './look';
import './styles.css';

applyRememberedLook();

createRoot(document.getElementById('root')!).render(<App />);
