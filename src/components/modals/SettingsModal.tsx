import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Cpu,
  Image as ImageIcon,
  KeyRound,
  Layers,
  Loader2,
  LogOut,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useGame } from '../../context/GameContext';
import { evaluatePasswordStrength } from '../../lib/authErrors';
import {
  AIStatusSnapshot,
  fetchAIStatus,
  processPendingAITasks,
  refreshAIModels,
} from '../../services/gameMasterService';

const STATUS_BADGE_STYLES: Record<AIStatusSnapshot['overallStatus'], string> = {
  Operational: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
  Limited: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
  'Switching model': 'bg-violet-500/15 text-violet-300 border-violet-500/35',
  'Waiting for free capacity': 'bg-amber-500/15 text-amber-200 border-amber-500/40',
  Pending: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
  'Temporarily unavailable': 'bg-rose-500/15 text-rose-300 border-rose-500/35',
};

export const SettingsModal: React.FC = () => {
  const {
    user,
    isEmailVerified,
    isPasswordAccount,
    accountProfile,
    updateUsername,
    changePassword,
    sendPasswordReset,
    signOutAccount,
    deleteAccount,
  } = useAuth();

  const {
    state,
    isSettingsOpen,
    setIsSettingsOpen,
    updateSettings,
    updatePlayerName,
    resetDemoState,
    cloudSyncStatus,
    cloudRevision,
    lastSyncedAt,
    syncNow,
    applyExternalCloudState,
  } = useGame();

  const [nameInput, setNameInput] = useState(state.player.name);
  const [nameSaving, setNameSaving] = useState(false);
  const [nameFeedback, setNameFeedback] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Account password & deletion state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMsg, setAccountMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deletePassword, setDeletePassword] = useState('');
  const [syncingManual, setSyncingManual] = useState(false);

  const [aiStatus, setAiStatus] = useState<AIStatusSnapshot | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiActionBusy, setAiActionBusy] = useState<'refresh' | 'queue' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [showAllModels, setShowAllModels] = useState(false);

  useEffect(() => {
    setNameInput(state.player.name);
    if (isSettingsOpen) {
      setAccountMsg(null);
      setNameFeedback(null);
      setDeleteStep(0);
      setDeletePassword('');
      setConfirmReset(false);
    }
  }, [state.player.name, isSettingsOpen]);

  const loadAIStatus = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const snapshot = await fetchAIStatus();
      setAiStatus(snapshot);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to load AI system status.');
    } finally {
      setAiLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) return;
    loadAIStatus();
  }, [isSettingsOpen, loadAIStatus]);

  if (!isSettingsOpen) return null;

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nameSaving) return;
    setNameSaving(true);
    setNameFeedback(null);
    try {
      const updated = await updateUsername(nameInput);
      if (updated.state && typeof updated.revision === 'number') {
        applyExternalCloudState(updated.state, updated.revision);
      } else {
        updatePlayerName(nameInput);
      }
      setNameFeedback('Adventurer name saved to your cloud profile.');
    } catch (err) {
      setNameFeedback(err instanceof Error ? err.message : 'Failed to update adventurer name.');
    } finally {
      setNameSaving(false);
    }
  };

  const handleManualSync = async () => {
    if (syncingManual) return;
    setSyncingManual(true);
    await syncNow();
    setSyncingManual(false);
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      await changePassword({
        currentPassword,
        newPassword,
        confirmPassword: confirmNewPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowChangePassword(false);
      setAccountMsg({ type: 'ok', text: 'Password updated successfully.' });
    } catch (err) {
      setAccountMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Password update failed.',
      });
    } finally {
      setAccountBusy(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!user?.email || accountBusy) return;
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      await sendPasswordReset(user.email);
      setAccountMsg({
        type: 'ok',
        text: `Password reset email sent to ${user.email}.`,
      });
    } catch (err) {
      setAccountMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Could not send reset email.',
      });
    } finally {
      setAccountBusy(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    setAccountMsg(null);
    try {
      await deleteAccount(isPasswordAccount ? deletePassword : undefined);
      setIsSettingsOpen(false);
    } catch (err) {
      setAccountMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to delete account.',
      });
    } finally {
      setAccountBusy(false);
    }
  };

  const handleRefreshCatalog = async () => {
    if (aiActionBusy) return;
    setAiActionBusy('refresh');
    setAiError(null);
    try {
      const snapshot = await refreshAIModels();
      setAiStatus(snapshot);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to refresh AI model catalog.');
    } finally {
      setAiActionBusy(null);
    }
  };

  const handleProcessQueue = async () => {
    if (aiActionBusy) return;
    setAiActionBusy('queue');
    setAiError(null);
    try {
      await processPendingAITasks();
      const snapshot = await fetchAIStatus();
      setAiStatus(snapshot);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to process pending queue.');
    } finally {
      setAiActionBusy(null);
    }
  };

  const visibleFreeModels = aiStatus
    ? showAllModels
      ? aiStatus.availableFreeModels
      : aiStatus.availableFreeModels.slice(0, 5)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={() => setIsSettingsOpen(false)}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-[#11131A] border border-white/[0.09] rounded-xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0">
          <h2 className="font-[var(--font-display)] text-lg font-semibold text-[#EDEFF5]">
            Character &amp; Chronicle Settings
          </h2>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(false)}
            aria-label="Close settings"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Account & Cloud Sync */}
          <div className="p-4 rounded-xl bg-[#0A0B0F] border border-white/[0.08] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-[#EDEFF5]">
                  Account &amp; Cloud Sync
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {isEmailVerified && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                    <CheckCircle2 className="w-3 h-3" />
                    VERIFIED
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncingManual}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-[11px] text-slate-300 cursor-pointer disabled:opacity-50"
                >
                  <Cloud className={`w-3 h-3 ${syncingManual ? 'animate-pulse text-violet-300' : 'text-sky-300'}`} />
                  <span>
                    {cloudSyncStatus === 'syncing'
                      ? 'Syncing...'
                      : cloudSyncStatus === 'offline'
                        ? 'Offline (Cached)'
                        : `Synced · rev ${cloudRevision}`}
                  </span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="px-3 py-2 rounded-lg bg-[#11131A] border border-white/[0.05]">
                <div className="text-[11px] text-slate-500">Account Email</div>
                <div className="text-slate-200 font-medium truncate mt-0.5">
                  {user?.email || 'Authenticated User'}
                </div>
              </div>
              <div className="px-3 py-2 rounded-lg bg-[#11131A] border border-white/[0.05]">
                <div className="text-[11px] text-slate-500">Last Cloud Sync</div>
                <div className="text-slate-300 font-mono text-[11px] mt-0.5">
                  {lastSyncedAt
                    ? new Date(lastSyncedAt).toLocaleTimeString()
                    : 'Synchronized on load'}
                  {' · '}
                  {accountProfile?.user?.signInProvider === 'google.com' ? 'Google' : 'Email'}
                </div>
              </div>
            </div>

            {/* Character / Username */}
            <form onSubmit={handleSaveName} className="space-y-1.5">
              <label htmlFor="player-name-input" className="block text-xs font-medium text-slate-300">
                Adventurer Name (Username)
              </label>
              <div className="flex gap-2">
                <input
                  id="player-name-input"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  maxLength={32}
                  className="flex-1 px-3.5 py-2 rounded-lg bg-[#11131A] border border-white/10 text-sm text-[#EDEFF5] focus:outline-none focus:border-violet-400"
                />
                <button
                  type="submit"
                  disabled={nameSaving}
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  {nameSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
              {nameFeedback && (
                <div className="text-[11px] text-violet-300">{nameFeedback}</div>
              )}
            </form>

            {accountMsg && (
              <div
                className={`p-2.5 rounded-lg border text-xs ${
                  accountMsg.type === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                {accountMsg.text}
              </div>
            )}

            {/* Account Actions: Change Password / Reset Password / Sign Out */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {isPasswordAccount && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowChangePassword((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs text-slate-200 cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-violet-300" />
                    <span>Change Password</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSendResetEmail}
                    disabled={accountBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs text-slate-300 cursor-pointer disabled:opacity-50"
                  >
                    <span>Send Reset Email</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => {
                  setIsSettingsOpen(false);
                  void signOutAccount();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs text-slate-200 cursor-pointer ml-auto"
              >
                <LogOut className="w-3.5 h-3.5 text-amber-300" />
                <span>Sign Out</span>
              </button>
            </div>

            {showChangePassword && isPasswordAccount && (
              <form
                onSubmit={handleChangePasswordSubmit}
                className="p-3.5 rounded-lg bg-[#11131A] border border-white/[0.08] space-y-2.5"
              >
                <div className="text-xs font-medium text-slate-200">Update Account Password</div>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  className="w-full px-3 py-2 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-[#EDEFF5] focus:outline-none focus:border-violet-400"
                />
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 8 chars, mixed)"
                  className="w-full px-3 py-2 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-[#EDEFF5] focus:outline-none focus:border-violet-400"
                />
                {newPassword.length > 0 && (
                  <div className="text-[11px] text-slate-400">
                    Strength: {evaluatePasswordStrength(newPassword).label}
                  </div>
                )}
                <input
                  type="password"
                  required
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-3 py-2 rounded-lg bg-[#0A0B0F] border border-white/10 text-xs text-[#EDEFF5] focus:outline-none focus:border-violet-400"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={accountBusy}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium cursor-pointer disabled:opacity-50"
                  >
                    {accountBusy ? 'Updating...' : 'Save New Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowChangePassword(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 text-slate-300 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Preferences */}
          <div className="space-y-3 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {state.settings.soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-violet-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                )}
                <div>
                  <div className="text-sm font-medium text-slate-200">Audio Chimes</div>
                  <div className="text-xs text-slate-500">
                    Gentle synthesized chimes on EXP and level-ups
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSettings({ soundEnabled: !state.settings.soundEnabled })
                }
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  state.settings.soundEnabled
                    ? 'bg-violet-600/25 text-violet-200 border border-violet-500/40'
                    : 'bg-white/5 text-slate-400 border border-white/10'
                }`}
              >
                {state.settings.soundEnabled ? 'Enabled' : 'Muted'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-200">Reduced Motion</div>
                <div className="text-xs text-slate-500">
                  Minimize celebratory transitions
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSettings({ reducedMotion: !state.settings.reducedMotion })
                }
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  state.settings.reducedMotion
                    ? 'bg-violet-600/25 text-violet-200 border border-violet-500/40'
                    : 'bg-white/5 text-slate-400 border border-white/10'
                }`}
              >
                {state.settings.reducedMotion ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {/* AI Infrastructure & Free Model Status */}
          <div className="space-y-4 pt-4 border-t border-white/[0.06]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-[#EDEFF5]">
                  AI Infrastructure &amp; Free Model Status
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
                  <ShieldCheck className="w-3 h-3" />
                  FREE-ONLY
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshCatalog}
                  disabled={aiLoading || aiActionBusy !== null}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs text-slate-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${aiActionBusy === 'refresh' ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh Models</span>
                </button>
                <button
                  type="button"
                  onClick={handleProcessQueue}
                  disabled={aiLoading || aiActionBusy !== null}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/35 text-xs text-violet-200 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Process Queue</span>
                </button>
              </div>
            </div>

            {aiError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{aiError}</span>
              </div>
            )}

            {aiLoading && !aiStatus ? (
              <div className="p-4 rounded-lg bg-[#0A0B0F] border border-white/[0.06] text-xs text-slate-400">
                Checking free AI providers and model health...
              </div>
            ) : aiStatus ? (
              <div className="space-y-3.5">
                {/* Overall Status & Active Model */}
                <div className="p-3.5 rounded-lg bg-[#0A0B0F] border border-white/[0.07] space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-slate-400" />
                      <span className="text-xs text-slate-400">System Status</span>
                      <span
                        className={`px-2 py-0.5 rounded border text-[11px] font-medium ${
                          STATUS_BADGE_STYLES[aiStatus.overallStatus]
                        }`}
                      >
                        {aiStatus.overallStatus}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400">
                      Cost Guard: $0.00 max
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div className="px-3 py-2 rounded bg-[#11131A] border border-white/[0.05]">
                      <div className="text-[11px] text-slate-500">Active Free Model</div>
                      <div className="text-slate-200 font-medium truncate mt-0.5">
                        {aiStatus.activeModelName || 'No healthy free model'}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 truncate">
                        {aiStatus.activeProvider
                          ? `${aiStatus.activeProvider} · ${aiStatus.activeModelId}`
                          : 'Waiting for free capacity'}
                      </div>
                    </div>

                    <div className="px-3 py-2 rounded bg-[#11131A] border border-white/[0.05]">
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <ImageIcon className="w-3 h-3" />
                        <span>Image Artwork Pool</span>
                      </div>
                      <div
                        className={`font-medium mt-0.5 ${
                          aiStatus.imageGenerationAvailable ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {aiStatus.imageGenerationAvailable
                          ? 'Free image model active'
                          : 'Awaiting free image model'}
                      </div>
                      <div className="text-[11px] text-slate-500 line-clamp-2">
                        {aiStatus.imageGenerationReason}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pool & Queue Counts */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                  <div className="p-2.5 rounded-lg bg-[#0A0B0F] border border-white/[0.06]">
                    <div className="text-base font-mono font-semibold text-emerald-300 tabular-nums">
                      {aiStatus.availableFreeModels.length}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Available</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A0B0F] border border-white/[0.06]">
                    <div className="text-base font-mono font-semibold text-amber-300 tabular-nums">
                      {aiStatus.cooldownModels.length}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Cooldown</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A0B0F] border border-white/[0.06]">
                    <div className="text-base font-mono font-semibold text-rose-300 tabular-nums">
                      {aiStatus.unavailableModels.length}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Unavailable</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A0B0F] border border-white/[0.06]">
                    <div className="text-base font-mono font-semibold text-sky-300 tabular-nums">
                      {aiStatus.pendingTaskCount}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Pending</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A0B0F] border border-white/[0.06]">
                    <div className="text-base font-mono font-semibold text-violet-300 tabular-nums">
                      {aiStatus.awaitingArtworkCount}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Artwork Wait</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#0A0B0F] border border-white/[0.06]">
                    <div className="text-base font-mono font-semibold text-slate-300 tabular-nums">
                      {aiStatus.failedTaskCount}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Failed</div>
                  </div>
                </div>

                {/* Usage, Quota & Real Token Metrics */}
                <div className="p-3.5 rounded-lg bg-[#0A0B0F] border border-white/[0.07] space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-300 font-medium">
                    <span>Usage &amp; Free Quota</span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                      RPM {aiStatus.usage.requestsLastMinute}/{aiStatus.usage.maxRequestsPerMinute} ·
                      Daily {aiStatus.usage.dailyRequests}/{aiStatus.usage.dailyBudget}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400 font-mono">
                    <div>
                      Success/Fail/429:{' '}
                      <span className="text-slate-200">
                        {aiStatus.usage.successfulRequests}/{aiStatus.usage.failedRequests}/
                        {aiStatus.usage.rateLimitErrors}
                      </span>
                    </div>
                    <div>
                      Tokens (in/out):{' '}
                      <span className="text-slate-200">
                        {aiStatus.usage.totalTokens !== null
                          ? `${aiStatus.usage.inputTokens ?? 0} / ${aiStatus.usage.outputTokens ?? 0} (${aiStatus.usage.totalTokens})`
                          : 'No token data reported yet'}
                      </span>
                    </div>
                  </div>
                  {aiStatus.usage.openRouterQuota && (
                    <div className="text-[11px] font-mono text-violet-300">
                      OpenRouter Account Daily Free Quota:{' '}
                      {aiStatus.usage.openRouterQuota.used} /{' '}
                      {aiStatus.usage.openRouterQuota.limit} used (
                      {aiStatus.usage.openRouterQuota.remaining} remaining)
                    </div>
                  )}
                </div>

                {/* Configured Providers */}
                <div className="flex flex-wrap gap-2">
                  {aiStatus.providers.map((p) => (
                    <div
                      key={p.provider}
                      className={`px-2.5 py-1.5 rounded-md border text-[11px] ${
                        p.configured && p.enabled
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                          : 'bg-white/[0.03] border-white/[0.08] text-slate-400'
                      }`}
                    >
                      <span className="font-semibold uppercase">{p.provider}</span>:{' '}
                      <span>{p.configured ? (p.enabled ? 'Ready' : 'Disabled') : 'Not configured'}</span>
                    </div>
                  ))}
                </div>

                {/* Available Free Models */}
                {aiStatus.availableFreeModels.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                        <Layers className="w-3.5 h-3.5 text-violet-400" />
                        <span>Verified Free Models ({aiStatus.availableFreeModels.length})</span>
                      </div>
                      {aiStatus.availableFreeModels.length > 5 && (
                        <button
                          type="button"
                          onClick={() => setShowAllModels((v) => !v)}
                          className="text-[11px] text-violet-300 hover:text-violet-200 cursor-pointer"
                        >
                          {showAllModels
                            ? 'Show fewer'
                            : `Show all (${aiStatus.availableFreeModels.length})`}
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                      {visibleFreeModels.map((m) => (
                        <div
                          key={m.id}
                          className="px-3 py-2 rounded-md bg-[#0A0B0F] border border-white/[0.06] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="text-slate-200 font-medium truncate">
                              {m.displayName}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 truncate">
                              {m.id} · {Math.round(m.contextLength / 1000)}k ctx
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1 shrink-0">
                            {m.pools.map((pool) => (
                              <span
                                key={pool}
                                className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 text-[10px] font-mono"
                              >
                                {pool}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Models in Cooldown / Recent Failures */}
                {(aiStatus.cooldownModels.length > 0 || aiStatus.recentFailures.length > 0) && (
                  <div className="p-3 rounded-lg bg-[#0A0B0F] border border-white/[0.06] space-y-2">
                    <div className="text-xs font-medium text-amber-300">
                      Cooldown &amp; Recent Failover Log
                    </div>
                    {aiStatus.cooldownModels.slice(0, 4).map((m) => (
                      <div key={m.id} className="text-[11px] text-slate-400 font-mono truncate">
                        [Cooldown] {m.id}: {m.lastFailureReason || 'Temporary backoff'}
                      </div>
                    ))}
                    {aiStatus.recentFailures.slice(0, 3).map((f, idx) => (
                      <div key={`${f.timestamp}_${idx}`} className="text-[11px] text-slate-500 truncate">
                        [{f.errorType}] {f.modelId}: {f.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Reset Character & Permanent Account Deletion */}
          <div className="pt-4 border-t border-white/[0.06] space-y-5">
            <div>
              <div className="text-xs text-slate-400 mb-3">
                All Chronicle progress is securely backed up in your cloud account. You can restart your character at Level 1 while keeping your account active.
              </div>
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 text-xs font-medium transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Character to Level 1</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetDemoState();
                      setConfirmReset(false);
                      setIsSettingsOpen(false);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium cursor-pointer"
                  >
                    Confirm Character Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-white/[0.06]">
              <div className="text-xs font-medium text-rose-300 mb-1">
                Delete Account Permanently
              </div>
              <div className="text-xs text-slate-400 mb-3">
                Permanently deletes your login account and all cloud progression (EXP, Chronicles, quests, achievements, collectibles, and AI queue history).
              </div>

              {deleteStep === 0 && (
                <button
                  type="button"
                  onClick={() => setDeleteStep(1)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-rose-500/35 text-rose-300 hover:bg-rose-500/10 text-xs font-medium transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Account</span>
                </button>
              )}

              {deleteStep === 1 && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/35 space-y-3">
                  <div className="text-xs text-rose-200 leading-relaxed">
                    <strong>Warning:</strong> This action cannot be undone. Every Chronicle entry, attribute point, quest, badge, and collectible tied to <strong>{user?.email}</strong> will be permanently erased.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDeleteStep(2)}
                      className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium cursor-pointer"
                    >
                      Continue to Final Confirmation
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteStep(0)}
                      className="px-3.5 py-2 rounded-lg bg-white/5 text-slate-300 text-xs font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {deleteStep === 2 && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/40 space-y-3">
                  <div className="text-xs text-rose-200 font-medium">
                    Final Step: Confirm Permanent Account Deletion
                  </div>
                  {isPasswordAccount && (
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="Enter your current password to confirm"
                      className="w-full px-3 py-2 rounded-lg bg-[#0A0B0F] border border-rose-400/35 text-xs text-[#EDEFF5] focus:outline-none focus:border-rose-400"
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={accountBusy || (isPasswordAccount && !deletePassword)}
                      onClick={handleConfirmDeleteAccount}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {accountBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Permanently Delete My Account</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteStep(0);
                        setDeletePassword('');
                      }}
                      className="px-3.5 py-2 rounded-lg bg-white/5 text-slate-300 text-xs font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
