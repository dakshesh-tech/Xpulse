import React, { useState } from 'react';
import {
  Award,
  BarChart3,
  Backpack,
  Flame,
  LogOut,
  Menu,
  Plus,
  ScrollText,
  Settings,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useGame } from '../../context/GameContext';
import { NavSection } from '../../types/rpg';
import { getLevelProgress } from '../../utils/leveling';
import { SafeImage } from '../common/RpgIcon';

interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'character', label: 'Character', icon: <User className="w-4 h-4" /> },
  { id: 'quests', label: 'Quest Log', icon: <ScrollText className="w-4 h-4" /> },
  { id: 'achievements', label: 'Achievements', icon: <Award className="w-4 h-4" /> },
  { id: 'statistics', label: 'Statistics', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'challenges', label: 'Challenges', icon: <Flame className="w-4 h-4" /> },
  { id: 'collection', label: 'Collection', icon: <Backpack className="w-4 h-4" /> },
];

export const Sidebar: React.FC = () => {
  const { signOutAccount } = useAuth();
  const {
    state,
    activeNav,
    setActiveNav,
    openGMModal,
    setIsSettingsOpen,
  } = useGame();
  const [mobileOpen, setMobileOpen] = useState(false);

  const levelInfo = getLevelProgress(state.player.totalExp);
  const equippedTitle = state.titles.find((t) => t.id === state.player.equippedTitleId);
  const equippedCosmetic = state.cosmetics.find(
    (c) => c.id === state.player.equippedCosmeticId
  );

  const handleNavClick = (id: NavSection) => {
    setActiveNav(id);
    setMobileOpen(false);
  };

  const renderSidebarBody = () => (
    <div className="flex flex-col h-full bg-[#0D0F15] border-r border-white/[0.07]">
      {/* Brand + Player Profile Card at Top */}
      <div className="p-5 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-5">
          <span className="font-[var(--font-display)] text-base tracking-wider text-amber-200/90 font-semibold whitespace-nowrap">
            Chronicle
          </span>
          <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap">
            LVL {levelInfo.level}
          </span>
        </div>

        <button
          type="button"
          onClick={() => handleNavClick('character')}
          className="w-full flex items-center gap-3.5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 rounded-lg p-1 -m-1 transition-colors"
        >
          <div
            className={`relative w-12 h-12 rounded-lg overflow-hidden shrink-0 ${
              equippedCosmetic?.borderClass ?? 'ring-1 ring-amber-400/50'
            }`}
          >
            <SafeImage
              src={state.player.avatarUrl}
              alt={`${state.player.name} portrait`}
              className="w-full h-full object-cover"
              fallbackIcon="User"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-[#EDEFF5] group-hover:text-amber-200 transition-colors truncate">
              {state.player.name}
            </div>
            <div className="text-xs text-amber-300/80 truncate mt-0.5">
              {equippedTitle?.name ?? 'Adventurer'}
            </div>
          </div>
        </button>

        {/* EXP Progress Indicator */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 tabular-nums font-mono">
            <span>EXP {state.player.totalExp.toLocaleString()}</span>
            <span>{levelInfo.nextLevelCeiling.toLocaleString()}</span>
          </div>
          <div className="h-1.5 w-full bg-[#191D29] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-violet-500 via-violet-400 to-amber-300 rounded-full transition-all duration-500"
              style={{ width: `${levelInfo.percentage}%` }}
            />
          </div>
          <div className="mt-1.5 text-[11px] text-slate-500 tabular-nums">
            {levelInfo.expRemaining.toLocaleString()} EXP to Level {levelInfo.level + 1}
          </div>
        </div>

        {/* Prominent Log Experience Action */}
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            openGMModal();
          }}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-sm font-medium transition-colors shadow-[0_0_20px_-6px_rgba(139,92,246,0.65)] whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Log Experience</span>
        </button>
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-[#171A26] text-[#EDEFF5] border border-violet-500/30'
                  : 'text-slate-400 hover:text-[#EDEFF5] hover:bg-white/[0.03] border border-transparent'
              }`}
            >
              <span className={isActive ? 'text-violet-400' : 'text-slate-500'}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Settings & Sign Out */}
      <div className="p-3 border-t border-white/[0.06] flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            setIsSettingsOpen(true);
          }}
          className="flex-1 flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-[#EDEFF5] hover:bg-white/[0.03] transition-colors whitespace-nowrap cursor-pointer"
        >
          <Settings className="w-4 h-4 text-slate-500" />
          <span>Settings</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            void signOutAccount();
          }}
          aria-label="Sign out"
          title="Sign out"
          className="p-2.5 rounded-lg text-slate-400 hover:text-amber-300 hover:bg-white/[0.04] transition-colors cursor-pointer shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0 h-screen sticky top-0 z-20">
        {renderSidebarBody()}
      </aside>

      {/* Mobile Compact Header (< 15% viewport height) */}
      <header className="lg:hidden sticky top-0 z-30 h-14 px-4 bg-[#0D0F15]/95 backdrop-blur-md border-b border-white/[0.07] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="p-2 -ml-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-[var(--font-display)] text-sm font-semibold tracking-wider text-amber-200 whitespace-nowrap">
            Chronicle
          </span>
          <span className="text-xs font-mono text-slate-400 tabular-nums whitespace-nowrap">
            Lvl {levelInfo.level}
          </span>
        </div>

        <button
          type="button"
          onClick={() => openGMModal()}
          className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Log Experience</span>
        </button>
      </header>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-72 max-w-[82vw] h-full z-10">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation menu"
              className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 z-20 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            {renderSidebarBody()}
          </div>
        </div>
      )}
    </>
  );
};
