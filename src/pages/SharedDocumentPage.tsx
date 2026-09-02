import { Download, FileLock2, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDocuments } from '../documents/DocumentsContext';
import type { RedeemedDocumentShare } from '../types/documentCompliance';

export function SharedDocumentPage() {
  const { hash } = useLocation();
  const token = hash.startsWith('#') ? hash.slice(1) : '';
  const { redeemSharedDocument } = useDocuments();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [documentAccess, setDocumentAccess] = useState<RedeemedDocumentShare | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [resolvedToken, setResolvedToken] = useState('');
  const requestSequence = useRef(0);
  const redeeming = useRef(false);
  const redeemAbort = useRef<AbortController | null>(null);
  const activeToken = useRef(token);
  activeToken.current = token;

  useEffect(() => () => {
    if (localUrl) URL.revokeObjectURL(localUrl);
  }, [localUrl]);

  useEffect(() => {
    redeemAbort.current?.abort();
    redeemAbort.current = null;
    requestSequence.current += 1;
    redeeming.current = false;
    setStatus('idle');
    setDocumentAccess(null);
    setLocalUrl(null);
    setResolvedToken('');
  }, [token]);

  useEffect(() => () => {
    requestSequence.current += 1;
    redeeming.current = false;
    redeemAbort.current?.abort();
  }, []);

  const openDocument = async () => {
    if (redeeming.current) return;
    redeeming.current = true;
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    redeemAbort.current = controller;
    setStatus('loading');
    setDocumentAccess(null);
    try {
      const result = await redeemSharedDocument(token, controller.signal);
      if (sequence !== requestSequence.current || token !== activeToken.current) return;
      const url = result.blob ? URL.createObjectURL(result.blob) : result.downloadUrl ?? null;
      if (!url) throw new Error('Arquivo indisponível.');
      setLocalUrl(result.blob ? url : null);
      setDocumentAccess(result);
      setResolvedToken(token);
      setStatus('ready');
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.displayName;
      anchor.rel = 'noopener noreferrer';
      anchor.referrerPolicy = 'no-referrer';
      anchor.click();
    } catch {
      if (sequence === requestSequence.current) setStatus('error');
    } finally {
      if (sequence === requestSequence.current) {
        redeeming.current = false;
        if (redeemAbort.current === controller) redeemAbort.current = null;
      }
    }
  };

  const accessUrl = resolvedToken === token ? documentAccess?.downloadUrl ?? localUrl : null;

  return (
    <main id="main-content" className="min-h-screen bg-[#F7FAF7] px-4 py-10 text-[#0B3D2E]" tabIndex={-1}>
      <div className="mx-auto max-w-xl rounded-3xl border border-[#0B3D2E]/15 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#78C89A]/20">
            <FileLock2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[#0B3D2E]/65">AgroCore</p>
            <h1 className="text-xl font-bold">Documento protegido</h1>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-[#78C89A]/35 bg-[#78C89A]/10 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="text-sm leading-relaxed">Este acesso vale para um único arquivo, possui prazo e quantidade limitada de aberturas.</p>
          </div>
        </div>

        {status === 'error' ? (
          <div className="mt-6" role="alert">
            <p className="font-semibold">Este acesso não está mais disponível.</p>
            <p className="mt-1 text-sm text-[#0B3D2E]/65">Ele pode ter expirado, sido revogado ou atingido o limite de aberturas.</p>
          </div>
        ) : (
          <p className="mt-6 text-sm leading-relaxed text-[#0B3D2E]/70">A abertura só será contada depois que você confirmar abaixo. Não encaminhe este endereço para outras pessoas.</p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {status !== 'ready' && status !== 'error' && (
            <button type="button" className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-3 font-semibold text-white hover:bg-[#0B3D2E]/90 focus:outline-none focus:ring-2 focus:ring-[#78C89A] disabled:cursor-not-allowed disabled:opacity-60" onClick={() => void openDocument()} disabled={status === 'loading'}>
              {status === 'loading' ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Download className="h-5 w-5" aria-hidden="true" />}
              {status === 'loading' ? 'Autorizando…' : 'Abrir documento'}
            </button>
          )}
          {status === 'ready' && accessUrl && (
            <a className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-4 py-3 font-semibold text-white hover:bg-[#0B3D2E]/90 focus:outline-none focus:ring-2 focus:ring-[#78C89A]" href={accessUrl} download={documentAccess?.displayName} rel="noopener noreferrer" referrerPolicy="no-referrer">
              <Download className="h-5 w-5" aria-hidden="true" /> Abrir novamente
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
