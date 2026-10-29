import React, { useState, useEffect } from 'react';
import { Database, ShieldCheck, Check, X, Flame, AlertCircle, Info, Copy, ExternalLink } from 'lucide-react';
import { FirebaseSettings } from '../types';
import { realtimeDB } from '../services/firebaseRealtime';

interface FirebaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirebaseConfigModal: React.FC<FirebaseConfigModalProps> = ({ isOpen, onClose }) => {
  const [apiKey, setApiKey] = useState('');
  const [authDomain, setAuthDomain] = useState('');
  const [databaseURL, setDatabaseURL] = useState('');
  const [projectId, setProjectId] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [messagingSenderId, setMessagingSenderId] = useState('');
  const [appId, setAppId] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [rawJson, setRawJson] = useState('');

  useEffect(() => {
    const saved = realtimeDB.getSavedFirebaseConfig();
    if (saved) {
      setApiKey(saved.apiKey || '');
      setAuthDomain(saved.authDomain || '');
      setDatabaseURL(saved.databaseURL || '');
      setProjectId(saved.projectId || '');
      setStorageBucket(saved.storageBucket || '');
      setMessagingSenderId(saved.messagingSenderId || '');
      setAppId(saved.appId || '');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const config: FirebaseSettings = {
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim(),
      databaseURL: databaseURL.trim(),
      projectId: projectId.trim(),
      storageBucket: storageBucket.trim(),
      messagingSenderId: messagingSenderId.trim(),
      appId: appId.trim(),
    };

    realtimeDB.saveFirebaseConfig(config);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1500);
  };

  const handlePasteJson = () => {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed.apiKey) setApiKey(parsed.apiKey);
      if (parsed.authDomain) setAuthDomain(parsed.authDomain);
      if (parsed.databaseURL) setDatabaseURL(parsed.databaseURL);
      if (parsed.projectId) setProjectId(parsed.projectId);
      if (parsed.storageBucket) setStorageBucket(parsed.storageBucket);
      if (parsed.messagingSenderId) setMessagingSenderId(parsed.messagingSenderId);
      if (parsed.appId) setAppId(parsed.appId);
      setRawJson('');
    } catch {
      alert('El texto no es un JSON válido.');
    }
  };

  const isConnected = realtimeDB.isUsingFirebase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-6 text-white max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/30">
            <Flame className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Configuración Firebase Realtime Database</h2>
            <p className="text-xs text-slate-400">
              Conexión directa en tiempo real v10 para sincronización entre dispositivos
            </p>
          </div>
        </div>

        {/* Current status banner */}
        <div
          className={`p-3.5 rounded-xl border mb-5 flex items-center justify-between text-xs ${
            isConnected
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-indigo-950/60 border-indigo-800 text-indigo-300'
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-indigo-400'
              }`}
            />
            <span>
              {isConnected
                ? 'Conectado a tu proyecto de Firebase Realtime Database'
                : 'Modo Sincronización Realtime Local Activo (Multi-Pestaña y Dispositivo)'}
            </span>
          </div>
          <span className="text-[10px] font-bold uppercase bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700">
            {isConnected ? 'Remoto' : 'P2P / Local'}
          </span>
        </div>

        {/* Quick Paste JSON */}
        <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800 mb-4">
          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
            Pegar objeto de configuración de Firebase (opcional):
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              placeholder='{"apiKey": "AIza...", "databaseURL": "https://..."}'
              className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={handlePasteJson}
              className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition"
            >
              Cargar
            </button>
          </div>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-3 text-xs">
          <div>
            <label className="text-slate-300 font-medium block mb-1">Database URL (RTDB):</label>
            <input
              type="text"
              value={databaseURL}
              onChange={(e) => setDatabaseURL(e.target.value)}
              placeholder="https://tu-proyecto-default-rtdb.firebaseio.com"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-medium block mb-1">API Key:</label>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-slate-300 font-medium block mb-1">Project ID:</label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="mi-proyecto-uber"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-300 font-medium block mb-1">Auth Domain:</label>
              <input
                type="text"
                value={authDomain}
                onChange={(e) => setAuthDomain(e.target.value)}
                placeholder="mi-proyecto.firebaseapp.com"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none"
              />
            </div>
            <div>
              <label className="text-slate-300 font-medium block mb-1">App ID:</label>
              <input
                type="text"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                placeholder="1:123456789:web:abcdef"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800 mt-2">
            <button
              type="button"
              onClick={() => {
                realtimeDB.clearFirebaseConfig();
                setApiKey('');
                setDatabaseURL('');
                setProjectId('');
                alert('Configuración de Firebase limpiada.');
              }}
              className="text-slate-400 hover:text-rose-400 text-xs transition"
            >
              Restablecer a Sincronización Local
            </button>

            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4" /> ¡Guardado!
                </>
              ) : (
                'Guardar y Conectar'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
