import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useVN } from '../context/VNContext';
import type { VNPackage } from '../../server/vn/types/vnTypes';

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

export function VNProjectsPage() {
  const navigate = useNavigate();
  const { setPackage } = useVN();

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const font = "VT323, 'Courier New', monospace";

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
            Past Projects
          </h1>
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
            Back to New Story
          </button>
        </div>

        {isLoading && (
          <div style={{ color: 'rgba(255,255,255,.48)', letterSpacing: '.12em', fontSize: 16 }}>
            Loading generated projects...
          </div>
        )}

        {!isLoading && projects.length === 0 && !error && (
          <div style={{ color: 'rgba(255,255,255,.48)', letterSpacing: '.08em', fontSize: 16 }}>
            No generated projects yet.
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
          {projects.map((project) => (
            <div
              key={project.id}
              style={{
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 6,
                background: 'rgba(255,255,255,.03)',
                padding: '14px 16px',
                display: 'grid',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, letterSpacing: '.08em', color: 'rgba(255,255,255,.94)' }}>
                    {project.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.58)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
                    {project.genre} · {project.artStyle}
                  </div>
                </div>
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
          ))}
        </div>
      </div>
    </div>
  );
}
