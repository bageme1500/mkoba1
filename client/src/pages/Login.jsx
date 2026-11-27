import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, useAction } from '../components.jsx';

export default function Login() {
    const { login } = useAuth();
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const { busy, error, run } = useAction();

    const submit = (e) => {
        e.preventDefault();
        run(() => login(phone, password));
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-4 py-10">
            <div className="w-full max-w-sm">
                <h1 className="text-center text-2xl font-semibold text-brand-700">M-Koba Tracker</h1>
                <p className="mt-1 text-center text-sm text-gray-500">Know who has paid, every month.</p>
                <form onSubmit={submit} className="card mt-6 space-y-4">
                    <Field label="Phone number">
                        <input className="input" type="tel" inputMode="tel" autoComplete="username" placeholder="0712 345 678" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                    </Field>
                    <Field label="Password">
                        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </Field>
                    <ErrorBox error={error} />
                    <button className="btn btn-primary w-full" disabled={busy}>
                        {busy ? 'Logging in…' : 'Log in'}
                    </button>
                </form>
                <p className="mt-4 text-center text-sm text-gray-600">
                    Group leader starting out?{' '}
                    <Link to="/register" className="font-medium text-brand-700 hover:underline">
                        Register your group
                    </Link>
                </p>
            </div>
        </div>
    );
}
