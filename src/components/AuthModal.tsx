import React, { useState } from 'react';
import { Shield, User, Lock, CheckCircle2, X, Building2, Truck } from 'lucide-react';
import type { AuthUser, UserRole } from '../services/apiTypes';
import { DEFAULT_USERS } from '../services/apiDefaults';
import { api } from '../services/api';
import { nielStore } from '../store/nielStore';

interface AuthModalProps {
  currentUser: AuthUser;
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ currentUser, isOpen, onClose }) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentUser.role);
  const [emailInput, setEmailInput] = useState(currentUser.email);
  const [passwordInput, setPasswordInput] = useState('••••••••••••');
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleRoleSwitch = async (role: UserRole) => {
    setSelectedRole(role);
    const matched = DEFAULT_USERS[role];
    setEmailInput(matched.email);
    const updatedUser = await api.login(matched.email, role, passwordInput);
    nielStore.setCurrentUser(updatedUser);
    setIsSuccess(true);
    setTimeout(() => setIsSuccess(false), 2000);
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedUser = await api.login(emailInput, selectedRole, passwordInput);
    nielStore.setCurrentUser(updatedUser);
    setIsSuccess(true);
    setTimeout(() => {
      setIsSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 select-none animate-in fade-in duration-200">
      <div className="glass-panel w-full max-w-lg rounded-3xl p-6 border border-cyan-500/30 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">NER Platform Authentication & RBAC</h2>
              <p className="text-[11px] text-cyan-300/80 font-mono">Phase 1 & 2 · JWT Protected Roles</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Quick-Switch Tabs */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Select Active Operating Role (RBAC):</label>
          <div className="grid grid-cols-3 gap-2">
            {/* Admin */}
            <button
              type="button"
              onClick={() => handleRoleSwitch('admin')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                selectedRole === 'admin'
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Shield className="w-4 h-4 text-cyan-400" />
                {selectedRole === 'admin' && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-300" />}
              </div>
              <div className="font-bold text-xs text-white">Admin</div>
              <div className="text-[10px] text-slate-400">Full corridor & dispatch control</div>
            </button>

            {/* Field Officer */}
            <button
              type="button"
              onClick={() => handleRoleSwitch('field_officer')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                selectedRole === 'field_officer'
                  ? 'bg-rose-500/25 border-rose-400 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Building2 className="w-4 h-4 text-rose-400" />
                {selectedRole === 'field_officer' && <CheckCircle2 className="w-3.5 h-3.5 text-rose-300" />}
              </div>
              <div className="font-bold text-xs text-white">Field Officer</div>
              <div className="text-[10px] text-slate-400">Spatial incident reporting & sync</div>
            </button>

            {/* Transporter */}
            <button
              type="button"
              onClick={() => handleRoleSwitch('transporter')}
              className={`p-3 rounded-2xl border text-left transition-all ${
                selectedRole === 'transporter'
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <Truck className="w-4 h-4 text-emerald-400" />
                {selectedRole === 'transporter' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />}
              </div>
              <div className="font-bold text-xs text-white">Transporter</div>
              <div className="text-[10px] text-slate-400">Fleet GPS & cargo delivery logs</div>
            </button>
          </div>
        </div>

        {/* User Details & Login Form */}
        <form onSubmit={handleCustomLogin} className="space-y-3.5">
          <div className="space-y-1">
            <label className="text-xs text-slate-300 font-medium">User Email Address</label>
            <div className="flex items-center glass-panel-subtle rounded-xl px-3 py-2 border border-white/10 focus-within:border-cyan-400/50">
              <User className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-xs text-white"
                placeholder="name@agency.gov.in"
                required
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-300 font-medium">JWT Secure Passkey</label>
            <div className="flex items-center glass-panel-subtle rounded-xl px-3 py-2 border border-white/10 focus-within:border-cyan-400/50">
              <Lock className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-transparent border-none outline-none text-xs text-white font-mono"
                required
              />
            </div>
          </div>

          {/* Active Session Token Preview */}
          <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 space-y-1 text-[11px] font-mono">
            <div className="text-slate-400 flex items-center justify-between">
              <span>ACTIVE USER:</span>
              <span className="text-cyan-300 font-bold">{currentUser.name}</span>
            </div>
            <div className="text-slate-400 flex items-center justify-between">
              <span>ROLE / SCOPE:</span>
              <span className="text-emerald-400 uppercase font-semibold">{currentUser.role}</span>
            </div>
            <div className="text-slate-500 truncate">
              TOKEN: {currentUser.token || 'jwt-bearer-active'}
            </div>
          </div>

          {isSuccess && (
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs text-center font-medium animate-in fade-in">
              Role permissions verified & JWT token updated!
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-all shadow-lg shadow-cyan-500/25"
            >
              Apply & Authenticate Session
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
