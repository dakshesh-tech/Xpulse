/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { RotateCcw, X } from 'lucide-react';
import { AuthScreen } from './components/auth/AuthScreen';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GameProvider, useGame } from './context/GameContext';
import { Sidebar } from './components/layout/Sidebar';
import { CharacterView } from './components/views/CharacterView';
import { QuestLogView } from './components/views/QuestLogView';
import { AchievementsView } from './components/views/AchievementsView';
import { StatisticsView } from './components/views/StatisticsView';
import { ChallengesView } from './components/views/ChallengesView';
import { CollectionView } from './components/views/CollectionView';
import { GameMasterModal } from './components/gm/GameMasterModal';
import { AttributeDetailModal } from './components/modals/AttributeDetailModal';
import { SettingsModal } from './components/modals/SettingsModal';
import { RewardCelebration } from './components/modals/RewardCelebration';

const ChronicleShell: React.FC = () => {
  const { activeNav, undoToast, undoTaskAction, dismissUndoToast } = useGame();

  const renderView = () => {
    switch (activeNav) {
      case 'character':
        return <CharacterView />;
      case 'quests':
        return <QuestLogView />;
      case 'achievements':
        return <AchievementsView />;
      case 'statistics':
        return <StatisticsView />;
      case 'challenges':
        return <ChallengesView />;
      case 'collection':
        return <CollectionView />;
      default:
        return <CharacterView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0B0F] text-[#EDEFF5] flex flex-col lg:flex-row">
      <Sidebar />

      <main className="flex-1 min-w-0">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6 sm:py-8">
          {renderView()}
        </div>
      </main>

      {/* Immediate Undo Toast for Task / Milestone / Challenge Completions */}
      {undoToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#161925] border border-amber-400/35 shadow-2xl text-xs">
          <span className="text-slate-200 font-medium">{undoToast.label}</span>
          <button
            type="button"
            onClick={() => undoTaskAction(undoToast)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-[#0A0B0F] font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            onClick={dismissUndoToast}
            aria-label="Dismiss undo notification"
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Global Interactive Modals & Overlays */}
      <GameMasterModal />
      <AttributeDetailModal />
      <SettingsModal />
      <RewardCelebration />
    </div>
  );
};

const AuthenticatedChronicleGate: React.FC = () => {
  const {
    user,
    authLoading,
    profileLoading,
    isAuthenticated,
    isEmailVerified,
    needsMigrationChoice,
    initializedProfile,
  } = useAuth();

  if (
    authLoading ||
    !isAuthenticated ||
    !user ||
    !isEmailVerified ||
    profileLoading ||
    needsMigrationChoice ||
    !initializedProfile
  ) {
    return <AuthScreen />;
  }

  return (
    <GameProvider key={user.uid}>
      <ChronicleShell />
    </GameProvider>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AuthenticatedChronicleGate />
    </AuthProvider>
  );
}
