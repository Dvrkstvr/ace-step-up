import React, { useState } from 'react';
import { I18nProvider } from './context/I18nContext';
import { ResponsiveProvider } from './context/ResponsiveContext';
import { WorkspaceProvider } from './context/WorkspaceContext';
import { StudioProvider } from './context/StudioContext';
import { useWorkspace } from './context/WorkspaceContext';
import { useStudio } from './context/StudioContext';
import TopNav from './components/TopNav';
import Dashboard from './components/Dashboard';
import ContextSidebar from './components/ContextSidebar';
import { Player } from './components/Player';
import Studio from './components/Studio/Studio';
import { TrainingPanel } from './components/TrainingPanel';
import { Track, TopView } from './types';

function AppContent() {
  const { isOpen: studioOpen } = useStudio();
  const [topView, setTopView] = useState<TopView>('generation');
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);

  return (
    <div className="app-container">
      <TopNav topView={topView} onChangeView={setTopView} />
      <main className="app-main">
        {topView === 'training' ? (
          <TrainingPanel />
        ) : (
          <div className="dashboard-layout">
            <Dashboard onSelectTrack={setSelectedTrack} />
            <ContextSidebar selectedTrack={selectedTrack} />
          </div>
        )}
      </main>
      <Player />
      {studioOpen && <Studio />}
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ResponsiveProvider>
        <WorkspaceProvider>
          <StudioProvider>
            <AppContent />
          </StudioProvider>
        </WorkspaceProvider>
      </ResponsiveProvider>
    </I18nProvider>
  );
}
