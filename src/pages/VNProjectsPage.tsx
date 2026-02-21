import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useVN } from '../context/VNContext';
import { useLocale } from '../context/LocaleContext';
import { LanguageToggle } from '../components/shared/LanguageToggle';
import type { VNPackage } from '../../server/vn/types/vnTypes';
import { StoryPanel } from '../components/vn-build/StoryPanel';
import type { PlanDraftState, DraftPremise, DraftCharacter, DraftAct } from '../hooks/usePlanDraft';
import { FONT_MAIN as font } from '../lib/fonts';
import { t } from '../lib/i18n';

interface ProjectSummary {
  id: string;
  title: string;
  genre: string;
  artStyle: string;
  createdAt: string;
  totalScenes: number;
  estimatedDuration: string;
  generationMs: number;
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function vnPackageToDraft(pkg: VNPackage): PlanDraftState {
  const premise: DraftPremise = {
    title: pkg.title,
    artStyle: pkg.artStyle,
    setting: pkg.setting,
    premise: pkg.plot.premise,
    themes: pkg.plot.themes,
    possibleEndings: pkg.plot.possibleEndings,
  };
  const characters: DraftCharacter[] = pkg.characters.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    description: c.description,
    imagePrompt: c.imagePrompt,
    imageUrl: pkg.assets.characters[c.id]?.url,
  }));
  const acts: DraftAct[] = pkg.plot.acts.map((act) => ({
    id: act.id,
    title: act.title,
    scenes: act.scenes.map((scene) => ({
      id: scene.id,
      actId: act.id,
      title: scene.title,
      location: scene.location,
      beats: scene.beats,
      exitConditions: scene.exitConditions,
      mood: scene.mood,
      backgroundUrl: pkg.assets.backgrounds[scene.location]?.url,
      musicUrl: pkg.assets.music[scene.mood]?.url,
    })),
  }));
  return { premise, characters, acts, packageId: pkg.id };
}

export function VNProjectsPage() {
  const navigate = useNavigate();
  const { setPackage } = useVN();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [packageCache, setPackageCache] = useState<Record<string, VNPackage>>({});
  const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    fetch('/api/vn/projects')
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to fetch projects: ${res.status}`);
        return res.json() as Promise<{ projects: ProjectSummary[] }>;
      })
      .then((data) => {
        if (!active) return;
        setProjects(data.projects ?? []);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch projects');
      })
      .finally(() => {
        if (!active) return;
        setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleOpenProject = useCallback(async (packageId: string) => {
    setLoadingProjectId(packageId);
    setError(null);
    try {
      const res = await fetch(`/api/vn/projects/${packageId}`);
      if (!res.ok) {
        throw new Error(`Failed to load project: ${res.status}`);
      }
      const data = await res.json() as { package: VNPackage };
      if (!data.package) {
        throw new Error('Project payload missing package');
      }
      setPackage(data.package);
      navigate({ to: '/vn/play' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoadingProjectId(null);
    }
  }, [navigate, setPackage]);

  const handleToggleDetails = useCallback(async (projectId: string) => {
    if (expandedId === projectId) {
      setExpandedId(null);
      return;
    }
    if (packageCache[projectId]) {
      setExpandedId(projectId);
      return;
    }
    setExpandedId(projectId);
    setDetailsLoadingId(projectId);
    setError(null);
    try {
      const res = await fetch(`/api/vn/projects/${projectId}`);
      if (!res.ok) throw new Error(`Failed to load details: ${res.status}`);
      const data = await res.json() as { package: VNPackage };
      if (!data.package) throw new Error('Missing package in response');
      setPackageCache((prev) => ({ ...prev, [projectId]: data.package }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load details');
      setExpandedId(null);
    } finally {
      setDetailsLoadingId(null);
    }
  }, [expandedId, packageCache]);

  const { locale, setLocale } = useLocale();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#050505',
        color: '#fff',
        fontFamily: font,
        padding: '42px 20px',
      }}
    >
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ fontSize: 34, letterSpacing: '.2em', textTransform: 'uppercase', margin: 0 }}>
            {t('past_projects', locale)}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LanguageToggle
              locale={locale}
              onToggle={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}
            />
            <button
              type="button"
              onClick={() => navigate({ to: '/vn' })}
              style={{
                background: 'none',
                border: '1px solid rgba(255,255,255,.16)',
                color: 'rgba(255,255,255,.72)',
                fontFamily: font,
                fontSize: 14,
                letterSpacing: '.16em',
                textTransform: 'uppercase',
                padding: '8px 12px',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {t('back_to_new', locale)}
            </button>
          </div>
        </div>

        {isLoading && (
          <div style={{ color: 'rgba(255,255,255,.48)', letterSpacing: '.12em', fontSize: 16 }}>
            {t('loading_projects', locale)}
          </div>
        )}

        {!isLoading && projects.length === 0 && !error && (
          <div style={{ color: 'rgba(255,255,255,.48)', letterSpacing: '.08em', fontSize: 16 }}>
            {t('no_projects', locale)}
          </div>
        )}

        {error && (
          <div
            style={{
              marginBottom: 16,
              background: 'rgba(239,68,68,.14)',
              border: '1px solid rgba(239,68,68,.35)',
              borderRadius: 4,
              padding: '10px 12px',
              color: 'rgba(255,140,140,.96)',
              letterSpacing: '.08em',
              fontSize: 14,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {projects.map((project) => {
            const isExpanded = expandedId === project.id;
            const isDetailsLoading = detailsLoadingId === project.id;

            return (
              <div
                key={project.id}
                style={{
                  border: '1px solid rgba(255,255,255,.12)',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,.03)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Card header */}
                <div style={{ padding: '14px 16px', display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 20, letterSpacing: '.08em', color: 'rgba(255,255,255,.94)' }}>
                        {project.title}
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.58)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                        {project.genre} · {project.artStyle}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <button
                        type="button"
                        onClick={() => void handleToggleDetails(project.id)}
                        disabled={isDetailsLoading}
                        style={{
                          background: isExpanded ? 'rgba(255,198,70,.08)' : 'none',
                          border: `1px solid ${isExpanded ? 'rgba(255,198,70,.5)' : 'rgba(255,255,255,.2)'}`,
                          color: isExpanded ? 'rgba(255,198,70,.85)' : 'rgba(255,255,255,.58)',
                          fontFamily: font,
                          fontSize: 14,
                          letterSpacing: '.14em',
                          textTransform: 'uppercase',
                          borderRadius: 4,
                          padding: '8px 12px',
                          cursor: isDetailsLoading ? 'default' : 'pointer',
                          opacity: isDetailsLoading ? 0.6 : 1,
                        }}
                      >
                        {isDetailsLoading ? 'Loading...' : isExpanded ? 'Details ▲' : 'Details ▼'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleOpenProject(project.id)}
                        disabled={Boolean(loadingProjectId)}
                        style={{
                          background: 'rgba(255,255,255,.08)',
                          border: '1px solid rgba(255,255,255,.2)',
                          color: '#fff',
                          fontFamily: font,
                          fontSize: 14,
                          letterSpacing: '.14em',
                          textTransform: 'uppercase',
                          borderRadius: 4,
                          padding: '8px 12px',
                          cursor: loadingProjectId ? 'default' : 'pointer',
                          opacity: loadingProjectId && loadingProjectId !== project.id ? 0.4 : 1,
                        }}
                      >
                        {loadingProjectId === project.id ? 'Opening...' : 'Open'}
                      </button>
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.66)', letterSpacing: '.06em' }}>
                    Created: {formatDateTime(project.createdAt)}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.66)', letterSpacing: '.06em' }}>
                    Scenes: {project.totalScenes} · Duration: {project.estimatedDuration} · Generated in: {Math.round(project.generationMs / 1000)}s
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.42)', letterSpacing: '.06em' }}>
                    ID: {project.id}
                  </div>
                </div>

                {/* Accordion detail panel */}
                {isExpanded && (
                  <div
                    style={{
                      borderTop: '1px solid rgba(255,255,255,.08)',
                      height: 360,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}
                  >
                    {isDetailsLoading ? (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '100%',
                          color: 'rgba(255,255,255,.35)',
                          fontFamily: font,
                          fontSize: 16,
                          letterSpacing: '.12em',
                        }}
                      >
                        Loading details...
                      </div>
                    ) : packageCache[project.id] ? (
                      <StoryPanel draft={vnPackageToDraft(packageCache[project.id])} />
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
