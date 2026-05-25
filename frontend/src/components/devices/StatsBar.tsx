import React from "react";

interface StatsBarProps {
  total: number;
  online: number;
  offline: number;
  active: number;
  powerLive: string;
}

const StatsBar: React.FC<StatsBarProps> = ({ total, online, offline, active, powerLive }) => {
  return (
    <div className="grid grid-cols-5 gap-2">
      <div className="bg-card border rounded-lg p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-500 font-bold">T</div>
        <div>
          <div className="text-lg font-bold">{total}</div>
          <div className="text-xs text-muted-foreground">Total</div>
        </div>
      </div>
      <div className="bg-card border rounded-lg p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-green-500/20 flex items-center justify-center text-green-500 font-bold">O</div>
        <div>
          <div className="text-lg font-bold text-green-500">{online}</div>
          <div className="text-xs text-muted-foreground">En ligne</div>
        </div>
      </div>
      <div className="bg-card border rounded-lg p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-red-500/20 flex items-center justify-center text-red-500 font-bold">H</div>
        <div>
          <div className="text-lg font-bold text-red-500">{offline}</div>
          <div className="text-xs text-muted-foreground">Hors ligne</div>
        </div>
      </div>
      <div className="bg-card border rounded-lg p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold">A</div>
        <div>
          <div className="text-lg font-bold text-orange-500">{active}</div>
          <div className="text-xs text-muted-foreground">Actifs</div>
        </div>
      </div>
      <div className="bg-card border rounded-lg p-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center text-blue-500 font-bold">P</div>
        <div>
          <div className="text-lg font-bold">{powerLive}</div>
          <div className="text-xs text-muted-foreground">Puissance live</div>
        </div>
      </div>
    </div>
  );
};

export default StatsBar;