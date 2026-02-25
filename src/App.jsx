import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX,
  FileText, Award, ChevronDown, ChevronUp,
  CheckCircle, XCircle, AlertTriangle, Clock,
  User, MapPin, Hash, Calendar, Key, Download,
  FileSearch, Info, Trash2, Copy, Check,
  History as HistoryIcon, ChevronsDown, ChevronsUp,
  HardDrive, Layers, Sun, Moon
} from 'lucide-react';
import { verifyPDFSignatures, verifyCertificate, generateReport, getOverallStatus } from './utils/signatureVerifier';
import './App.css';

// ── Toast System ────────────────────────────────────────────────
let toastId = 0;
function ToastContainer({ toasts, onDismiss }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type} animate-slide-in`}>
          <div className="toast-icon">
            {t.type === 'success' ? <CheckCircle size={16} /> : t.type === 'error' ? <XCircle size={16} /> : <Info size={16} />}
          </div>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" onClick={() => onDismiss(t.id)}>&times;</button>
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = 'success') => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);
  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);
  return { toasts, addToast, dismiss };
}

// ── Floating Particles ──────────────────────────────────────────
function FloatingParticles() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let particles = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 2 + 0.5,
        dx: (Math.random() - 0.5) * 0.3,
        dy: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.3 + 0.05,
      });
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.dx;
        p.y += p.dy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59, 130, 246, ${p.opacity})`;
        ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dist = Math.hypot(particles[i].x - particles[j].x, particles[i].y - particles[j].y);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(59, 130, 246, ${0.06 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="particles-canvas" />;
}

// ── Helpers ─────────────────────────────────────────────────────
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(2) + ' MB';
}

const STATUS_META = {
  valid: { icon: ShieldCheck, label: 'Valid', cls: 'valid', desc: 'Signature is cryptographically valid and trusted.' },
  invalid: { icon: ShieldX, label: 'Invalid', cls: 'invalid', desc: 'Signature verification failed.' },
  tampered: { icon: ShieldX, label: 'Tampered', cls: 'tampered', desc: 'Document has been modified after signing.' },
  'self-signed': { icon: ShieldAlert, label: 'Self-Signed', cls: 'self-signed', desc: 'Certificate is self-signed and not trusted by a CA.' },
  expired: { icon: AlertTriangle, label: 'Expired', cls: 'expired', desc: 'The signing certificate has expired.' },
  untrusted: { icon: AlertTriangle, label: 'Untrusted', cls: 'untrusted', desc: 'Certificate chain could not be fully verified.' },
  none: { icon: Shield, label: 'No Signatures', cls: 'none', desc: 'No digital signatures were found in the document.' },
};

function statusMeta(status) { return STATUS_META[status] || STATUS_META.invalid; }

// ── Copy Button ─────────────────────────────────────────────────
function CopyButton({ text, toast }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast && toast('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch { /* noop */ }
  };
  return (
    <button className="copy-btn" onClick={copy} title="Copy to clipboard">
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

// ── Progress Bar ────────────────────────────────────────────────
function ProgressBar({ label }) {
  return (
    <div className="loading-card animate-in">
      <div className="progress-bar-track">
        <div className="progress-bar-fill" />
      </div>
      <p style={{ marginTop: '1rem' }}>{label}</p>
      <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Parsing CMS data and validating certificate chains
      </p>
    </div>
  );
}

// ── Signature Card ──────────────────────────────────────────────
function SignatureCard({ sig, index, forceExpand, toast }) {
  const [expanded, setExpanded] = useState(index === 0);
  const actualExpanded = forceExpand !== null ? forceExpand : expanded;

  const status = getOverallStatus(sig);
  const meta = statusMeta(status);
  const Icon = meta.icon;
  const initials = sig.signerName
    ? sig.signerName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : '??';

  return (
    <div className="sig-card animate-in" style={{ animationDelay: `${index * 0.08}s` }}>
      <div className="sig-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="sig-header-left">
          <div className="sig-avatar">{initials}</div>
          <div>
            <div className="sig-title">{sig.signerName || 'Unknown Signer'}</div>
            <div className="sig-subtitle">{sig.fieldName} {sig.signerEmail ? `• ${sig.signerEmail}` : ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className={`badge ${meta.cls}`}><Icon size={12} />{meta.label}</span>
          {actualExpanded ? <ChevronUp size={16} color="var(--text-muted)" /> : <ChevronDown size={16} color="var(--text-muted)" />}
        </div>
      </div>

      <div className={`sig-card-body ${actualExpanded ? 'expanded' : ''}`}>
        {/* Check pills */}
        <div>
          <div className="section-label">Verification Checks</div>
          <div className="checks-row">
            <span className={`check-pill ${sig.integrityValid ? 'pass' : 'fail'}`}>
              {sig.integrityValid ? <CheckCircle size={13} /> : <XCircle size={13} />} Integrity
            </span>
            <span className={`check-pill ${sig.certTrustValid ? 'pass' : 'warn'}`}>
              {sig.certTrustValid ? <CheckCircle size={13} /> : <AlertTriangle size={13} />} Certificate Trust
            </span>
            <span className={`check-pill ${!sig.isExpired ? 'pass' : 'fail'}`}>
              {!sig.isExpired ? <CheckCircle size={13} /> : <XCircle size={13} />} Not Expired
            </span>
            <span className={`check-pill ${!sig.isSelfSigned ? 'pass' : 'warn'}`}>
              {!sig.isSelfSigned ? <CheckCircle size={13} /> : <AlertTriangle size={13} />} CA Signed
            </span>
          </div>
        </div>

        {/* Signer info */}
        <div>
          <div className="section-label">Signer Details</div>
          <div className="info-grid">
            <InfoItem icon={User} label="Signer Name" value={sig.signerName || '—'} />
            <InfoItem icon={User} label="Email" value={sig.signerEmail || '—'} />
            <InfoItem icon={Clock} label="Signing Time" value={sig.signingTime ? new Date(sig.signingTime).toLocaleString() : '—'} />
            <InfoItem icon={FileText} label="Reason" value={sig.reason || '—'} />
            <InfoItem icon={MapPin} label="Location" value={sig.location || '—'} />
          </div>
        </div>

        {/* Certificate chain */}
        {sig.certificates && sig.certificates.length > 0 && (
          <div>
            <div className="section-label">Certificate Chain ({sig.certificates.length})</div>
            <div className="cert-chain">
              {sig.certificates.map((cert, ci) => (
                <div className="cert-item" key={ci}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div className="cert-name">{cert.subject}</div>
                    {cert.isExpired && <span className="badge expired" style={{ fontSize: '0.65rem' }}><AlertTriangle size={10} />Expired</span>}
                  </div>
                  <div className="cert-meta">
                    <span className="cert-meta-item">Issued by: {cert.issuer}</span>
                    <span className="cert-meta-item">Valid: {new Date(cert.validFrom).toLocaleDateString()} - {new Date(cert.validTo).toLocaleDateString()}</span>
                    <span className="cert-meta-item">SN: {cert.serialNumber}</span>
                  </div>
                  <div className="cert-fp">
                    SHA-256: {cert.fingerprint}
                    <CopyButton text={cert.fingerprint} toast={toast} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors & Warnings */}
        {(sig.errors?.length > 0 || sig.warnings?.length > 0) && (
          <div>
            <div className="section-label">Issues</div>
            <div className="alert-list">
              {sig.errors?.map((e, i) => (
                <div key={i} className="alert-item error"><XCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{e}</div>
              ))}
              {sig.warnings?.map((w, i) => (
                <div key={i} className="alert-item warning"><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />{w}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="info-item">
      <div className="info-label">{label}</div>
      <div className="info-value" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <Icon size={13} color="var(--text-muted)" />
        {value}
      </div>
    </div>
  );
}

// ── History Sidebar ─────────────────────────────────────────────
function HistorySidebar({ history, onSelect, isOpen, onClose }) {
  if (!isOpen) return null;
  return (
    <div className="history-overlay" onClick={onClose}>
      <div className="history-sidebar animate-slide-right" onClick={e => e.stopPropagation()}>
        <div className="history-header">
          <h3><HistoryIcon size={16} /> Verification History</h3>
          <button className="toast-close" onClick={onClose}>&times;</button>
        </div>
        {history.length === 0 && (
          <div className="empty-state" style={{ padding: '2rem 1rem' }}>
            <p>No documents verified yet.</p>
          </div>
        )}
        <div className="history-list">
          {history.map((entry, i) => {
            const overallStatus = entry.result.hasSignatures
              ? entry.result.signatures.reduce((acc, sig) => {
                const s = getOverallStatus(sig);
                if (s === 'invalid' || s === 'tampered') return 'invalid';
                if (acc === 'valid' && (s === 'expired' || s === 'self-signed' || s === 'untrusted')) return s;
                return acc;
              }, 'valid')
              : 'none';
            const meta = statusMeta(overallStatus);
            const Icon = meta.icon;
            return (
              <div key={i} className="history-item" onClick={() => { onSelect(entry); onClose(); }}>
                <div className={`history-status-dot ${meta.cls}`}><Icon size={14} /></div>
                <div className="history-info">
                  <div className="history-name">{entry.fileName}</div>
                  <div className="history-meta">
                    {entry.result.signatures.length} signature{entry.result.signatures.length !== 1 ? 's' : ''}
                    &nbsp;&middot;&nbsp;
                    {formatFileSize(entry.fileSize)}
                    &nbsp;&middot;&nbsp;
                    {new Date(entry.time).toLocaleTimeString()}
                  </div>
                </div>
                <span className={`badge ${meta.cls}`} style={{ fontSize: '0.65rem' }}>{meta.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── PDF Verifier Tab ────────────────────────────────────────────
function PDFVerifierTab({ history, addToHistory, toast }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [fileSize, setFileSize] = useState(null);
  const [forceExpand, setForceExpand] = useState(null);
  const [batchResults, setBatchResults] = useState([]);
  const [batchMode, setBatchMode] = useState(false);

  const processSingle = useCallback(async (file) => {
    setLoading(true);
    setResult(null);
    setBatchResults([]);
    setBatchMode(false);
    setError(null);
    setFileName(file.name);
    setFileSize(file.size);
    setForceExpand(null);

    try {
      const res = await verifyPDFSignatures(file);
      setResult(res);
      addToHistory({ fileName: file.name, fileSize: file.size, result: res, time: Date.now() });
      toast('Verification complete', 'success');
    } catch (err) {
      setError('Failed to process document: ' + err.message);
      toast('Verification failed', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToHistory, toast]);

  const processBatch = useCallback(async (files) => {
    setLoading(true);
    setResult(null);
    setError(null);
    setFileName(null);
    setForceExpand(null);
    setBatchMode(true);
    const results = [];

    for (const file of files) {
      try {
        const res = await verifyPDFSignatures(file);
        const entry = { fileName: file.name, fileSize: file.size, result: res, time: Date.now() };
        results.push(entry);
        addToHistory(entry);
      } catch (err) {
        results.push({ fileName: file.name, fileSize: file.size, result: null, error: err.message, time: Date.now() });
      }
    }

    setBatchResults(results);
    setLoading(false);
    toast(`Batch complete: ${results.length} file${results.length !== 1 ? 's' : ''} processed`, 'success');
  }, [addToHistory, toast]);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 1) {
      processSingle(acceptedFiles[0]);
    } else if (acceptedFiles.length > 1) {
      processBatch(acceptedFiles);
    }
  }, [processSingle, processBatch]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
  });

  const overallStatus = result
    ? result.hasSignatures
      ? result.signatures.reduce((acc, sig) => {
        const s = getOverallStatus(sig);
        if (s === 'invalid' || s === 'tampered') return 'invalid';
        if (acc === 'valid' && (s === 'expired' || s === 'self-signed' || s === 'untrusted')) return s;
        return acc;
      }, 'valid')
      : 'none'
    : null;

  const meta = overallStatus ? statusMeta(overallStatus) : null;
  const OverallIcon = meta ? meta.icon : null;

  const validCount = result?.signatures.filter(s => getOverallStatus(s) === 'valid').length ?? 0;
  const warnCount = result?.signatures.filter(s => ['expired', 'self-signed', 'untrusted'].includes(getOverallStatus(s))).length ?? 0;
  const badCount = result?.signatures.filter(s => ['invalid', 'tampered'].includes(getOverallStatus(s))).length ?? 0;

  const showSingle = result && !batchMode;
  const showBatch = batchResults.length > 0 && batchMode;

  return (
    <div>
      {!result && !loading && !showBatch && (
        <>
          <div className="hero">
            <h1>Verify Digital Signatures</h1>
            <p>Upload signed PDF documents to verify all embedded digital signatures, certificate chains, and document integrity.</p>
          </div>
          <div className="dropzone-wrapper">
            <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
              <input {...getInputProps()} />
              <div className="icon"><FileSearch size={28} color="white" /></div>
              <h3>{isDragActive ? 'Drop to verify...' : 'Drop PDFs here or click to browse'}</h3>
              <p>Supports single file or batch verification</p>
              <div className="formats">
                <span className="format-badge">.pdf</span>
                <span className="format-badge">PAdES</span>
                <span className="format-badge">PKCS#7 / CMS</span>
                <span className="format-badge">Batch Mode</span>
              </div>
            </div>
          </div>
        </>
      )}

      {loading && <ProgressBar label={<>Analyzing signatures...</>} />}

      {error && (
        <div className="status-card invalid animate-in">
          <div className="status-icon invalid"><XCircle size={24} /></div>
          <div className="status-text"><h3>Processing Error</h3><p>{error}</p></div>
        </div>
      )}

      {/* Batch results */}
      {showBatch && !loading && (
        <div className="animate-in">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Layers size={18} color="var(--accent-purple)" />
              <span style={{ fontWeight: 600 }}>Batch Results &mdash; {batchResults.length} files</span>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary" {...getRootProps()}><input {...getInputProps()} /><FileSearch size={14} /> New Batch</button>
              <button className="btn btn-danger" onClick={() => { setBatchResults([]); setBatchMode(false); }}><Trash2 size={14} /> Clear</button>
            </div>
          </div>

          <div className="batch-grid">
            {batchResults.map((entry, i) => {
              const st = entry.result?.hasSignatures
                ? entry.result.signatures.reduce((acc, sig) => {
                  const s = getOverallStatus(sig);
                  if (s === 'invalid' || s === 'tampered') return 'invalid';
                  if (acc === 'valid' && (s === 'expired' || s === 'self-signed' || s === 'untrusted')) return s;
                  return acc;
                }, 'valid')
                : entry.error ? 'invalid' : 'none';
              const m = statusMeta(st);
              const I = m.icon;
              return (
                <div key={i} className="batch-card animate-in" style={{ animationDelay: `${i * 0.05}s` }}
                  onClick={() => { if (entry.result) { setResult(entry.result); setFileName(entry.fileName); setFileSize(entry.fileSize); setBatchMode(false); setBatchResults([]); } }}>
                  <div className={`batch-status-icon ${m.cls}`}><I size={20} /></div>
                  <div className="batch-info">
                    <div className="batch-name">{entry.fileName}</div>
                    <div className="batch-meta">
                      {entry.result ? `${entry.result.signatures.length} signature${entry.result.signatures.length !== 1 ? 's' : ''}` : 'Error'}
                      &nbsp;&middot;&nbsp;{formatFileSize(entry.fileSize)}
                    </div>
                  </div>
                  <span className={`badge ${m.cls}`}>{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Single result */}
      {showSingle && (
        <div className="animate-in">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <FileText size={18} color="var(--accent-blue)" />
              <span style={{ fontWeight: 600 }}>{fileName}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{result.numPages} page{result.numPages !== 1 ? 's' : ''}</span>
              {fileSize && <span className="file-size-badge"><HardDrive size={11} />{formatFileSize(fileSize)}</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {result.hasSignatures && result.signatures.length > 1 && (
                <>
                  <button className="btn btn-secondary" onClick={() => setForceExpand(true)}><ChevronsDown size={14} /> Expand All</button>
                  <button className="btn btn-secondary" onClick={() => setForceExpand(false)}><ChevronsUp size={14} /> Collapse All</button>
                </>
              )}
              <button className="btn btn-secondary" {...getRootProps()}><input {...getInputProps()} /><FileSearch size={14} /> Open Another</button>
              <button className="btn btn-danger" onClick={() => { setResult(null); setFileName(null); setFileSize(null); setForceExpand(null); }}><Trash2 size={14} /> Clear</button>
            </div>
          </div>

          {result.hasSignatures && (
            <div className="metrics-row">
              <div className="metric-card"><div className="metric-value">{result.signatures.length}</div><div className="metric-label">Total Signatures</div></div>
              <div className="metric-card"><div className="metric-value metric-green">{validCount}</div><div className="metric-label">Valid</div></div>
              <div className="metric-card"><div className="metric-value metric-yellow">{warnCount}</div><div className="metric-label">Warnings</div></div>
              <div className="metric-card"><div className="metric-value metric-red">{badCount}</div><div className="metric-label">Invalid</div></div>
              <div className="metric-card"><div className="metric-value">{result.numPages}</div><div className="metric-label">Pages</div></div>
            </div>
          )}

          {meta && (
            <div className={`status-card ${meta.cls} animate-in`} style={{ marginBottom: '1.5rem' }}>
              <div className={`status-icon ${meta.cls}`}><OverallIcon size={24} /></div>
              <div className="status-text">
                <h3>Overall: {meta.label}</h3>
                <p>{result.hasSignatures ? meta.desc : result.message}</p>
              </div>
            </div>
          )}

          {result.hasSignatures && (
            <div className="signatures-grid">
              {result.signatures.map((sig, i) => (
                <SignatureCard key={i} sig={sig} index={i} forceExpand={forceExpand} toast={toast} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Certificate Verifier Tab ────────────────────────────────────
function CertVerifierTab({ toast }) {
  const [loading, setLoading] = useState(false);
  const [certInfo, setCertInfo] = useState(null);
  const [error, setError] = useState(null);

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setLoading(true);
    setCertInfo(null);
    setError(null);
    try {
      const info = await verifyCertificate(file);
      setCertInfo(info);
      toast('Certificate parsed successfully', 'success');
    } catch (e) {
      setError(e.message);
      toast('Failed to parse', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/x-pem-file': ['.pem'],
      'application/pkix-cert': ['.cer', '.crt'],
      'application/x-x509-ca-cert': ['.cer', '.crt'],
    },
    multiple: false,
  });

  // Days remaining
  const daysLeft = certInfo ? Math.ceil((new Date(certInfo.validTo) - new Date()) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="cert-verifier">
      <div {...getRootProps()} className={`dropzone ${isDragActive ? 'active' : ''}`}>
        <input {...getInputProps()} />
        <div className="icon" style={{ background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))' }}>
          <Award size={28} color="white" />
        </div>
        <h3>{isDragActive ? 'Drop certificate...' : 'Drop a certificate file here'}</h3>
        <p>View and analyze X.509 certificate details, validity, and chain information</p>
        <div className="formats">
          <span className="format-badge">.pem</span>
          <span className="format-badge">.cer</span>
          <span className="format-badge">.crt</span>
        </div>
      </div>

      {loading && <ProgressBar label="Parsing certificate..." />}

      {error && (
        <div className="status-card invalid animate-in">
          <div className="status-icon invalid"><XCircle size={24} /></div>
          <div className="status-text"><h3>Failed to parse certificate</h3><p>{error}</p></div>
        </div>
      )}

      {certInfo && (
        <div className="cert-detail-card animate-in">
          <div className="cert-detail-header">
            <div className="sig-avatar" style={{ background: 'linear-gradient(135deg, var(--accent-cyan), var(--accent-purple))' }}>
              <Award size={18} color="white" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700 }}>{certInfo.subject?.CN || 'Certificate Details'}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {certInfo.isExpired
                  ? <span style={{ color: 'var(--accent-red)' }}>Expired</span>
                  : <span style={{ color: 'var(--accent-green)' }}>Valid</span>}
                {certInfo.isSelfSigned && <span style={{ color: 'var(--accent-yellow)' }}>Self-Signed</span>}
                {daysLeft !== null && !certInfo.isExpired && (
                  <span style={{ color: daysLeft < 30 ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>
                    {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="cert-detail-body">
            {/* Validity ring */}
            {!certInfo.isExpired && daysLeft !== null && (
              <div className="validity-bar-wrapper">
                <div className="section-label">Certificate Lifetime</div>
                <div className="validity-bar-outer">
                  <div className="validity-bar-inner" style={{
                    width: `${Math.max(2, Math.min(100, (1 - daysLeft / Math.ceil((new Date(certInfo.validTo) - new Date(certInfo.validFrom)) / (1000 * 60 * 60 * 24))) * 100))}%`,
                    background: daysLeft < 30 ? 'var(--accent-yellow)' : daysLeft < 90 ? 'var(--accent-orange)' : 'var(--accent-green)'
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  <span>{new Date(certInfo.validFrom).toLocaleDateString()}</span>
                  <span>{new Date(certInfo.validTo).toLocaleDateString()}</span>
                </div>
              </div>
            )}

            <div>
              <div className="section-label">Subject</div>
              <div className="info-grid">
                {Object.entries(certInfo.subject || {}).map(([k, v]) => (
                  <InfoItem key={k} icon={User} label={k} value={v} />
                ))}
              </div>
            </div>

            <div>
              <div className="section-label">Issuer</div>
              <div className="info-grid">
                {Object.entries(certInfo.issuer || {}).map(([k, v]) => (
                  <InfoItem key={k} icon={Shield} label={k} value={v} />
                ))}
              </div>
            </div>

            <div>
              <div className="section-label">Validity and Technical Details</div>
              <div className="info-grid">
                <InfoItem icon={Calendar} label="Valid From" value={new Date(certInfo.validFrom).toLocaleString()} />
                <InfoItem icon={Calendar} label="Valid To" value={new Date(certInfo.validTo).toLocaleString()} />
                <InfoItem icon={Hash} label="Serial Number" value={certInfo.serialNumber} />
                <InfoItem icon={Key} label="Algorithm" value={`${certInfo.publicKeyAlgorithm}${certInfo.keySize ? ` ${certInfo.keySize}-bit` : ''}`} />
              </div>
            </div>

            <div>
              <div className="section-label">SHA-256 Fingerprint</div>
              <div className="report-json" style={{ maxHeight: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{certInfo.fingerprint}</span>
                <CopyButton text={certInfo.fingerprint} toast={toast} />
              </div>
            </div>

            {certInfo.extensions && certInfo.extensions.length > 0 && (
              <div>
                <div className="section-label">Extensions ({certInfo.extensions.length})</div>
                <div className="info-grid">
                  {certInfo.extensions.map((ext, i) => (
                    <InfoItem key={i} icon={Info} label={ext.name || `ext_${i}`} value={String(ext.value).slice(0, 80)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Report Tab ──────────────────────────────────────────────────
function ReportTab({ verificationResult, fileName, toast }) {
  if (!verificationResult) {
    return (
      <div className="empty-state">
        <Shield size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem', display: 'block' }} />
        <h3>No Verification Results Yet</h3>
        <p>Go to the PDF Verifier tab and verify a document to generate a report.</p>
      </div>
    );
  }

  const report = generateReport(fileName, verificationResult);
  const jsonStr = JSON.stringify(report, null, 2);

  const downloadReport = () => {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verification-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Report downloaded', 'success');
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(jsonStr);
      toast('Report copied to clipboard', 'success');
    } catch { toast('Copy failed', 'error'); }
  };

  return (
    <div className="report-section animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>Verification Report</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            Generated at {new Date(report.reportGeneratedAt).toLocaleString()}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={copyReport}><Copy size={14} /> Copy JSON</button>
          <button className="btn btn-primary" onClick={downloadReport}><Download size={14} /> Export JSON</button>
        </div>
      </div>
      <pre className="report-json">{jsonStr}</pre>
    </div>
  );
}

// ── App Root ────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('pdf');
  const [pdfResult, setPdfResult] = useState(null);
  const [pdfFileName, setPdfFileName] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [theme, setTheme] = useState('dark');
  const { toasts, addToast, dismiss } = useToast();

  const addToHistory = useCallback((entry) => {
    setHistory(prev => [entry, ...prev].slice(0, 50));
  }, []);

  // Theme toggle
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === '1') { e.preventDefault(); setTab('pdf'); }
      if (e.ctrlKey && e.key === '2') { e.preventDefault(); setTab('cert'); }
      if (e.ctrlKey && e.key === '3') { e.preventDefault(); setTab('report'); }
      if (e.ctrlKey && e.key === 'h') { e.preventDefault(); setHistoryOpen(p => !p); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const TABS = [
    { id: 'pdf', label: 'PDF Verifier', icon: FileText },
    { id: 'cert', label: 'Certificate Inspector', icon: Award },
    { id: 'report', label: 'Report', icon: FileSearch },
  ];

  return (
    <div className="app">
      <FloatingParticles />
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
      <HistorySidebar history={history} onSelect={(entry) => { setPdfResult(entry.result); setPdfFileName(entry.fileName); setTab('pdf'); }} isOpen={historyOpen} onClose={() => setHistoryOpen(false)} />

      <header className="header">
        <div className="logo">
          <div className="logo-icon"><ShieldCheck size={20} color="white" /></div>
          <div>
            <div className="logo-text">DigiVerify</div>
            <div className="logo-sub">Digital Signature Verifier</div>
          </div>
        </div>
        <nav className="nav-tabs">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} className={`nav-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
                <Icon size={14} />{t.label}
              </button>
            );
          })}
        </nav>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button className="icon-btn" onClick={() => setHistoryOpen(true)} title="Verification History (Ctrl+H)">
            <HistoryIcon size={18} />
            {history.length > 0 && <span className="icon-btn-badge">{history.length}</span>}
          </button>
          <button className="icon-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="Toggle Theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="main-content">
        {tab === 'pdf' && <PDFVerifierTab history={history} addToHistory={addToHistory} toast={addToast} />}
        {tab === 'cert' && <CertVerifierTab toast={addToast} />}
        {tab === 'report' && <ReportTab verificationResult={pdfResult} fileName={pdfFileName} toast={addToast} />}
      </main>

      <footer className="app-footer">
        <div className="shortcuts">
          <span className="shortcut-item"><kbd>Ctrl+1</kbd> PDF</span>
          <span className="shortcut-item"><kbd>Ctrl+2</kbd> Cert</span>
          <span className="shortcut-item"><kbd>Ctrl+3</kbd> Report</span>
          <span className="shortcut-item"><kbd>Ctrl+H</kbd> History</span>
        </div>
      </footer>
    </div>
  );
}
