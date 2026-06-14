import React from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Cpu, Wifi, WifiOff, Power, Zap } from 'lucide-react';

interface StatsBarProps {
  stats: {
    total: number;
    online: number;
    offline: number;
    active: number;
    power?: string | number;
  };
  className?: string;
}

const STAT_ITEMS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  total: { label: 'Total', icon: <Cpu className="w-4 h-4" />, color: 'text-emerald-500 bg-emerald-100 dark:bg-emerald-500/10' },
  online: { label: 'En ligne', icon: <Wifi className="w-4 h-4" />, color: 'text-green-500 bg-green-100 dark:bg-green-500/10' },
  offline: { label: 'Hors ligne', icon: <WifiOff className="w-4 h-4" />, color: 'text-red-500 bg-red-100 dark:bg-red-500/10' },
  active: { label: 'Actifs', icon: <Power className="w-4 h-4" />, color: 'text-orange-500 bg-orange-100 dark:bg-orange-500/10' },
  power: { label: 'Puissance', icon: <Zap className="w-4 h-4" />, color: 'text-blue-500 bg-blue-100 dark:bg-blue-500/10' },
};

/**
 * Stats bar displaying device metrics with icons and colors
 */
const StatsBar: React.FC<StatsBarProps> = ({ stats, className }) => {
  return (
    <div className={cn('grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3', className)}>
      {Object.entries(stats).map(([key, value]) => {
        const config = STAT_ITEMS[key];
        if (!config) return null;
        return (
          <Card key={key} className="p-4 flex items-center gap-3 transition-all duration-200 hover:shadow-md">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', config.color)}>
              {config.icon}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-bold tracking-tight">{value ?? '—'}</div>
              <div className="text-xs text-muted-foreground">{config.label}</div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default StatsBar;
