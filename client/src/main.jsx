import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth.jsx';
import { ConfirmProvider, ToastProvider } from './components.jsx';
import { LanguageProvider } from './i18n.jsx';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <AuthProvider>
                <LanguageProvider>
                    <ToastProvider>
                        <ConfirmProvider>
                            <App />
                        </ConfirmProvider>
                    </ToastProvider>
                </LanguageProvider>
            </AuthProvider>
        </BrowserRouter>
    </StrictMode>,
);
