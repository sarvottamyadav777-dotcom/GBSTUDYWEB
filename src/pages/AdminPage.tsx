import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  ImagePlus,
  Lock,
  LogOut,
  Mail,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Link, useNavigate } from '../lib/router';
import { api, getAdminBearerToken, lockAdminRoute, setAdminBearerToken } from '../lib/api';
import type { AppItem, SliderPhoto, SocialPlatform } from '../lib/types';
import { SafeAppLogo } from '../components/BrandLogo';
import { Button, Input, Switch } from '../components/UiPrimitives';

interface AppFormState {
  name: string;
  logo_url: string | null;
  app_url: string;
  app_url_2: string;
  app_url_3: string;
  app_url_4: string;
  is_active: boolean;
}

const EMPTY_APP_FORM: AppFormState = {
  name: '',
  logo_url: null,
  app_url: '',
  app_url_2: '',
  app_url_3: '',
  app_url_4: '',
  is_active: true,
};

const SOCIAL_FIELDS: Array<{
  key: SocialPlatform;
  label: string;
  placeholder: string;
}> = [
  { key: 'telegram', label: 'Telegram', placeholder: 'https://t.me/yourname' },
  { key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourname' },
  { key: 'whatsapp', label: 'WhatsApp', placeholder: 'https://wa.me/919999999999' },
  { key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourname' },
];

function resizeImageToJpegDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('File read failed'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        const scale = Math.min(1, 1200 / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas error'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function SliderAdminSection({
  initialPhotos,
  onPhotosChange,
}: {
  initialPhotos: SliderPhoto[];
  onPhotosChange: (next: SliderPhoto[]) => void;
}) {
  const [photos, setPhotos] = useState<SliderPhoto[]>(initialPhotos);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replaceIdRef = useRef<string | null>(null);

  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  async function runAction(task: () => Promise<SliderPhoto[]>, successText: string) {
    setBusy(true);
    setErr('');
    setOk('');
    try {
      const next = await task();
      setPhotos(next);
      onPhotosChange(next);
      setOk(successText);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    await runAction(async () => {
      const items = await Promise.all(
        files.map(async (f) => ({ image_data: await resizeImageToJpegDataUrl(f) })),
      );
      const res = await api.uploadSliderPhotos(items);
      return res.sliderPhotos;
    }, 'Photo upload ho gaya — ab sabhi users ko dikh raha hai.');
  }

  async function handleReplace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const id = replaceIdRef.current;
    if (!file || !id) return;
    await runAction(async () => {
      const dataUrl = await resizeImageToJpegDataUrl(file);
      const res = await api.replaceSliderPhoto(id, dataUrl);
      return res.sliderPhotos;
    }, 'Photo badal diya — sabhi users par live update ho gaya.');
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Ye carousel photo delete karein?')) return;
    await runAction(async () => {
      const res = await api.deleteSliderPhoto(id);
      return res.sliderPhotos;
    }, 'Photo delete ho gaya.');
  }

  async function handleMove(id: string, direction: -1 | 1) {
    await runAction(async () => {
      const res = await api.reorderSliderPhoto(id, direction);
      return res.sliderPhotos;
    }, 'Order update ho gaya.');
  }

  return (
    <section className="admin-editor">
      <div className="admin-section-heading">
        <div>
          <span className="section-kicker">HOME SLIDER</span>
          <h2>Slide photos</h2>
          <p className="admin-section-note">
            Home page ke carousel me yahi photos sabhi users ko tab tak dikhenge jab tak aap
            khud change na karein. Best size: 1200×600 (2:1).
          </p>
        </div>
      </div>

      <div className="admin-form admin-card-form">
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => void handleUpload(e)}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void handleReplace(e)}
        />

        {photos.length === 0 && (
          <p className="admin-section-note">Abhi koi photo nahi hai.</p>
        )}

        <div className="slider-admin-grid">
          {photos.map((photo, index) => (
            <div key={photo.id} className="slider-admin-item">
              <img
                src={photo.image_data}
                alt={`Slide ${index + 1}`}
                referrerPolicy="no-referrer"
              />
              <div className="slider-admin-actions">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={busy || index === 0}
                  onClick={() => void handleMove(photo.id, -1)}
                  aria-label="Upar"
                >
                  <ArrowUp size={15} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={busy || index === photos.length - 1}
                  onClick={() => void handleMove(photo.id, 1)}
                  aria-label="Neeche"
                >
                  <ArrowDown size={15} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    replaceIdRef.current = photo.id;
                    replaceInputRef.current?.click();
                  }}
                  aria-label="Edit"
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void handleDelete(photo.id)}
                  aria-label="Delete"
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {err && <p className="form-error">{err}</p>}
        {ok && <p className="form-success">{ok}</p>}

        <div className="admin-form-actions admin-card-form-actions">
          <Button
            type="button"
            className="app-open-btn"
            disabled={busy}
            onClick={() => uploadInputRef.current?.click()}
          >
            {busy ? (
              'Please wait...'
            ) : (
              <>
                <ImagePlus size={15} /> Upload photo
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function AdminPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [backendWarning, setBackendWarning] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  const [apps, setApps] = useState<AppItem[]>([]);
  const [linkCounters, setLinkCounters] = useState<Record<string, [number, number, number, number]>>({});
  const [sliderPhotos, setSliderPhotos] = useState<SliderPhoto[]>([]);

  const [form, setForm] = useState<AppFormState>(EMPTY_APP_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savingApp, setSavingApp] = useState(false);
  const [appOk, setAppOk] = useState('');
  const [appErr, setAppErr] = useState('');
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const [headerTitle, setHeaderTitle] = useState('𝐆𝐁 𝐒𝐓𝐔𝐃𝐘');
  const [savingHeader, setSavingHeader] = useState(false);
  const [headerOk, setHeaderOk] = useState('');
  const [headerErr, setHeaderErr] = useState('');

  const [socialLinks, setSocialLinks] = useState<Record<SocialPlatform, string>>({
    telegram: '',
    youtube: '',
    whatsapp: '',
    instagram: '',
  });
  const [savingSocial, setSavingSocial] = useState(false);
  const [socialOk, setSocialOk] = useState('');
  const [socialErr, setSocialErr] = useState('');

  useEffect(() => {
    document.title = 'Admin Panel — GB STUDY';
  }, []);

  async function loadWorkspace() {
    const data = await api.getAdminWorkspace();
    setApps(data.apps);
    setLinkCounters(data.linkCounters);
    setHeaderTitle(data.headerTitle);
    setSocialLinks({
      telegram: data.socialLinks.telegram ?? '',
      youtube: data.socialLinks.youtube ?? '',
      whatsapp: data.socialLinks.whatsapp ?? '',
      instagram: data.socialLinks.instagram ?? '',
    });
    setSliderPhotos(data.sliderPhotos);
  }

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const status = await api.getAdminAuthStatus();
        if (!active) return;
        setNeedsSetup(status.needsSetup);
        if (status.kvBound === false) {
          setBackendWarning(
            'Cloudflare KV (GB_STUDY_KV) bind nahi hai — save karne ke liye Cloudflare Pages Settings > Functions > KV Bindings me "GB_STUDY_KV" bind karein.',
          );
        }
        if (status.authenticated && getAdminBearerToken()) {
          setAuthenticated(true);
          await loadWorkspace();
        } else {
          setAuthenticated(false);
        }
      } catch {
        if (active) {
          setAuthenticated(false);
          setBackendWarning(
            'Yeh static Direct Upload build par chal raha hai (live backend inactive hai). Live admin editing ke liye "Full Project + Functions ZIP" Cloudflare Pages (Git/Wrangler) se deploy karein aur GB_STUDY_KV bind karein, ya changes AI Studio me save karke naya Direct Upload ZIP re-upload karein.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, []);

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    try {
      const res = needsSetup
        ? await api.setupAdmin(email.trim(), password)
        : await api.loginAdmin(email.trim(), password);
      setAdminBearerToken(res.token);
      setNeedsSetup(false);
      setAuthenticated(true);
      setPassword('');
      setLoading(true);
      await loadWorkspace();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Email ya password sahi nahi hai. Dobara try karein.',
      );
    } finally {
      setAuthBusy(false);
      setLoading(false);
    }
  }

  function updateField<K extends keyof AppFormState>(key: K, value: AppFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startEdit(app: AppItem) {
    setEditingId(app.id);
    setForm({
      name: app.name,
      logo_url: app.logo_url,
      app_url: app.app_url ?? '',
      app_url_2: app.app_url_2 ?? '',
      app_url_3: app.app_url_3 ?? '',
      app_url_4: app.app_url_4 ?? '',
      is_active: app.is_active,
    });
    setAppOk('');
    setAppErr('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_APP_FORM);
    setAppErr('');
    setAppOk('');
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAppErr('Please choose an image file.');
      return;
    }
    if (file.size > 5_242_880) {
      setAppErr('Photo must be smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateField('logo_url', reader.result);
        setAppErr('');
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleSaveApp(e: React.FormEvent) {
    e.preventDefault();
    setSavingApp(true);
    setAppErr('');
    setAppOk('');
    try {
      const payload = {
        ...form,
        app_url: form.app_url.trim() || null,
        app_url_2: form.app_url_2.trim() || null,
        app_url_3: form.app_url_3.trim() || null,
        app_url_4: form.app_url_4.trim() || null,
      };
      if (editingId) {
        const { app } = await api.updateApp(editingId, payload);
        setApps((prev) => prev.map((a) => (a.id === editingId ? app : a)));
        setAppOk('Platform updated — sabhi users par turant live ho gaya.');
      } else {
        const { app } = await api.createApp(payload);
        setApps((prev) => [...prev, app].sort((a, b) => a.sort_order - b.sort_order));
        setAppOk('New platform permanent save ho gaya — ab sabhi users ko dikhai de raha hai.');
      }
      setEditingId(null);
      setForm(EMPTY_APP_FORM);
    } catch (err) {
      setAppErr(err instanceof Error ? err.message : 'App could not be saved.');
    } finally {
      setSavingApp(false);
    }
  }

  async function handleSaveHeader(e: React.FormEvent) {
    e.preventDefault();
    setSavingHeader(true);
    setHeaderErr('');
    setHeaderOk('');
    try {
      await api.saveBranding(headerTitle.trim());
      setHeaderOk('Header text saved.');
    } catch (err) {
      setHeaderErr(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingHeader(false);
    }
  }

  async function handleSaveSocialLinks(e: React.FormEvent) {
    e.preventDefault();
    setSavingSocial(true);
    setSocialErr('');
    setSocialOk('');
    try {
      await api.saveSocialLinks(socialLinks);
      setSocialOk('Social links saved.');
    } catch (err) {
      setSocialErr(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSavingSocial(false);
    }
  }

  function handleSignOut() {
    lockAdminRoute();
    setAdminBearerToken(null);
    setAuthenticated(false);
    setApps([]);
    navigate('/');
  }

  if (loading) {
    return <div className="admin-loading">Loading admin panel...</div>;
  }

  if (!authenticated) {
    return (
      <main className="auth-page">
        <div className="auth-glow auth-glow-one" />
        <div className="auth-glow auth-glow-two" />
        <div className="auth-card">
          <Link to="/" className="auth-back">
            <ArrowLeft size={15} /> Back to workspace
          </Link>

          <form className="auth-form" onSubmit={(e) => void handleAuthSubmit(e)}>
            {backendWarning && (
              <p className="form-error" style={{ marginBottom: 8 }}>
                {backendWarning}
              </p>
            )}
            {needsSetup && (
              <p className="admin-section-note" style={{ marginBottom: 4 }}>
                First-time setup: apna Admin Email aur Password set karein.
              </p>
            )}
            <label htmlFor="admin-email">Email</label>
            <div className="auth-input-wrap">
              <Mail size={15} />
              <Input
                id="admin-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <label htmlFor="admin-password">Password</label>
            <div className="auth-input-wrap">
              <Lock size={15} />
              <Input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={needsSetup ? 'new-password' : 'current-password'}
                minLength={needsSetup ? 6 : undefined}
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>

            {authError && <p className="form-error">{authError}</p>}

            <Button type="submit" className="auth-submit" disabled={authBusy}>
              {authBusy
                ? 'Checking...'
                : needsSetup
                  ? 'Create admin & open panel'
                  : 'Open admin panel'}
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <Link to="/" className="admin-back">
            <ArrowLeft size={15} /> Workspace
          </Link>
          <p className="eyebrow">
            <span className="eyebrow-dot" /> Catalog control
          </p>
          <h1>
            Manage study apps<span>.</span>
          </h1>
          <p className="admin-subtitle">
            Platforms jodte hi sabhi users ko live dikhte hain aur permanent save rehte hain.
          </p>
        </div>
        <Button variant="outline" onClick={handleSignOut}>
          <LogOut size={15} /> Sign out
        </Button>
      </header>

      <div className="admin-layout">
        {/* 1. ADD / EDIT APP */}
        <section className="admin-editor">
          <div className="admin-section-heading">
            <div>
              <span className="section-kicker">{editingId ? 'EDIT APP' : 'NEW APP'}</span>
              <h2>{editingId ? 'Update app details' : 'Add a new app'}</h2>
            </div>
            {editingId && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Cancel editing"
                onClick={cancelEdit}
              >
                <X size={17} />
              </Button>
            )}
          </div>

          <form
            onSubmit={(e) => void handleSaveApp(e)}
            className="admin-form app-card app-card-amber admin-card-form"
          >
            <span className="vip-badge">{editingId ? 'EDIT' : 'NEW'}</span>
            <div className="admin-card-upload">
              <button
                type="button"
                className="app-icon app-icon-logo admin-logo-button"
                aria-label="Choose app logo"
                onClick={() => logoInputRef.current?.click()}
              >
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Selected app logo"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <ImagePlus size={22} />
                )}
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => logoInputRef.current?.click()}
              >
                <Upload size={14} /> Choose logo
              </Button>
              <input
                ref={logoInputRef}
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
              />
            </div>

            <label className="admin-card-field">
              App name
              <Input
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="e.g. Physics Wallah"
                required
              />
            </label>

            <label className="admin-card-field">
              App URL link 1
              <Input
                type="url"
                value={form.app_url}
                onChange={(e) => updateField('app_url', e.target.value)}
                placeholder="https://example.com"
                required
              />
            </label>

            <label className="admin-card-field">
              App URL link 2
              <Input
                type="url"
                value={form.app_url_2}
                onChange={(e) => updateField('app_url_2', e.target.value)}
                placeholder="https://example.com/page-2"
              />
            </label>

            <label className="admin-card-field">
              App URL link 3
              <Input
                type="url"
                value={form.app_url_3}
                onChange={(e) => updateField('app_url_3', e.target.value)}
                placeholder="https://example.com/page-3"
              />
            </label>

            <label className="admin-card-field">
              App URL link 4
              <Input
                type="url"
                value={form.app_url_4}
                onChange={(e) => updateField('app_url_4', e.target.value)}
                placeholder="https://example.com/page-4"
              />
            </label>

            <div className="admin-status-field">
              <div>
                <strong>App status</strong>
                <span>{form.is_active ? 'ON · Home page' : 'OFF · Soon page'}</span>
              </div>
              <Switch
                checked={form.is_active}
                onCheckedChange={(checked) => updateField('is_active', checked)}
                aria-label="App status"
                className="admin-status-switch"
              />
            </div>

            {appErr && <p className="form-error">{appErr}</p>}
            {appOk && <p className="form-success">{appOk}</p>}

            <div className="admin-form-actions admin-card-form-actions">
              <Button type="submit" className="app-open-btn" disabled={savingApp}>
                {savingApp ? (
                  'Saving...'
                ) : editingId ? (
                  <>
                    <Save size={15} /> Save changes
                  </>
                ) : (
                  <>
                    <Plus size={15} /> Add app
                  </>
                )}
              </Button>
              {editingId && (
                <Button type="button" variant="outline" onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </section>

        {/* 2. HOME HEADER */}
        <section className="admin-editor">
          <div className="admin-section-heading">
            <div>
              <span className="section-kicker">HOME HEADER</span>
              <h2>Header text</h2>
              <p className="admin-section-note">
                Home page ke upar jo naam dikhta hai, yahan se badlo.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => void handleSaveHeader(e)}
            className="admin-form admin-card-form"
          >
            <label className="admin-card-field">
              Header text
              <Input
                value={headerTitle}
                onChange={(e) => setHeaderTitle(e.target.value)}
                placeholder="𝐆𝐁 𝐒𝐓𝐔𝐃𝐘"
              />
            </label>
            {headerErr && <p className="form-error">{headerErr}</p>}
            {headerOk && <p className="form-success">{headerOk}</p>}
            <div className="admin-form-actions admin-card-form-actions">
              <Button type="submit" className="app-open-btn" disabled={savingHeader}>
                {savingHeader ? (
                  'Saving...'
                ) : (
                  <>
                    <Save size={15} /> Save header text
                  </>
                )}
              </Button>
            </div>
          </form>
        </section>

        {/* 3. HOME SLIDER */}
        <SliderAdminSection
          initialPhotos={sliderPhotos}
          onPhotosChange={setSliderPhotos}
        />

        {/* 4. SOCIAL LINKS */}
        <section className="admin-editor">
          <div className="admin-section-heading">
            <div>
              <span className="section-kicker">OWNER PAGE &amp; HOME POP-UP</span>
              <h2>Social links</h2>
              <p className="admin-section-note">
                Yahi links home page ke join pop-up me dikhte hain.
              </p>
            </div>
          </div>

          <form
            onSubmit={(e) => void handleSaveSocialLinks(e)}
            className="admin-form admin-card-form"
          >
            {SOCIAL_FIELDS.map(({ key, label, placeholder }) => (
              <label key={key} className="admin-card-field">
                {label} link
                <Input
                  type="url"
                  value={socialLinks[key] ?? ''}
                  onChange={(e) =>
                    setSocialLinks((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  placeholder={placeholder}
                />
              </label>
            ))}
            {socialErr && <p className="form-error">{socialErr}</p>}
            {socialOk && <p className="form-success">{socialOk}</p>}
            <div className="admin-form-actions admin-card-form-actions">
              <Button type="submit" className="app-open-btn" disabled={savingSocial}>
                {savingSocial ? (
                  'Saving...'
                ) : (
                  <>
                    <Save size={15} /> Save social links
                  </>
                )}
              </Button>
            </div>
          </form>
        </section>

        {/* 5. CLOUDFLARE PAGES ZIP EXPORT */}
        <section className="admin-editor">
          <div className="admin-section-heading">
            <div>
              <span className="section-kicker">CLOUD PAGES DEPLOY</span>
              <h2>Download ZIP packages</h2>
              <p className="admin-section-note">
                Yahan save kiye gaye saare naye apps/photos har naye ZIP me automatically shamil ho
                jaate hain. Agar Cloudflare Pages par static Direct Upload ZIP use kar rahe hain,
                to naya app/photo jodne ke baad dubara Direct Upload ZIP download karke upload
                karein — ya live website par hi edit karne ke liye Full Project + Functions ZIP +
                GB_STUDY_KV deploy karein.
              </p>
            </div>
          </div>

          <div className="admin-form admin-card-form">
            <div className="admin-form-actions admin-card-form-actions" style={{ flexWrap: 'wrap', gap: 10 }}>
              <a
                href="/download/gb-study-cloudpages.zip"
                download="gb-study-cloudpages.zip"
                className="app-open-btn"
                style={{ textDecoration: 'none' }}
              >
                <Download size={15} /> Direct Upload ZIP (Cloudflare Pages)
              </a>
              <a
                href="/download/gb-study-source.zip"
                download="gb-study-source.zip"
                className="app-open-btn"
                style={{ textDecoration: 'none', opacity: 0.9 }}
              >
                <Download size={15} /> Full Project + Functions ZIP
              </a>
            </div>
          </div>
        </section>

        {/* 6. LIVE CATALOG */}
        <section className="admin-list-section">
          <div className="admin-section-heading">
            <div>
              <span className="section-kicker">LIVE CATALOG</span>
              <h2>{apps.length} apps in workspace</h2>
            </div>
            <span className="admin-live">
              <i /> Synced
            </span>
          </div>

          <div className="admin-list">
            {apps.length === 0 && (
              <div className="admin-empty">
                <Plus size={22} />
                <p>No apps yet. Add your first study tool.</p>
              </div>
            )}

            {apps.map((app) => {
              const counts = linkCounters[app.id] ?? [0, 0, 0, 0];
              const maxCount = Math.max(...counts, 1);
              const total = counts.reduce((sum, c) => sum + c, 0);

              return (
                <article key={app.id} className="admin-app-row admin-app-row-chart">
                  <div className="admin-app-top">
                    <div className="h-[44px] w-[44px] shrink-0 overflow-hidden rounded-[12px]">
                      <SafeAppLogo
                        src={app.logo_url}
                        alt={`${app.name} logo`}
                        name={app.name}
                      />
                    </div>
                    <div className="admin-app-copy">
                      <strong>{app.name}</strong>
                      <span>
                        <ShieldCheck
                          size={12}
                          style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }}
                        />
                        Permanent (Cannot be deleted)
                      </span>
                      <small>
                        {app.is_active
                          ? `ON · ${app.vip_text} · ${app.open_text}`
                          : 'OFF · COMING SOON'}
                      </small>
                    </div>
                    <div className="admin-row-actions">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${app.name}`}
                        onClick={() => startEdit(app)}
                      >
                        <Pencil size={15} />
                      </Button>
                      {app.app_url && (
                        <a
                          href={app.app_url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${app.name}`}
                        >
                          <ExternalLink size={15} />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="link-chart" aria-label={`${app.name} link users chart`}>
                    <div className="link-chart-head">
                      <span>Link users</span>
                      <strong className="tabular-nums">{total} total</strong>
                    </div>
                    {counts.map((count, idx) => (
                      <div key={idx} className="link-chart-row">
                        <span className="link-chart-label">Link {idx + 1}</span>
                        <div className="link-chart-track">
                          <div
                            className={`link-chart-bar link-chart-bar-${idx + 1}`}
                            style={{
                              width: `${Math.max((count / maxCount) * 100, count > 0 ? 8 : 0)}%`,
                            }}
                          />
                        </div>
                        <span className="link-chart-count tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
